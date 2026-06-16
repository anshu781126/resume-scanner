import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, BrowserRouter, Routes } from 'react-router-dom'
import mammoth from 'mammoth'
import { createClient } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist'
import { RTFJS } from 'rtf.js'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const storageKey = 'resume_scanner.supabase_anon_key'

interface ParsedResume {
  fileName: string
  fileType: string
  extractedText: string
  name: string
  email: string
  phone: string
  city: string
  state: string
  country: string
  skills: string[]
  summary: string
  experience: number | null
  dob: string
}

interface ResumeRecord {
  id: string
  file_name: string
  name: string
  email: string
  phone: string
  city: string | null
  state: string | null
  country: string | null
  skills: string[]
  summary: string | null
  raw_text: string | null
  experience: number | null
  dob: string | null
  created_at: string
}

const allowedTypes = ['.pdf', '.docx', '.doc', '.rtf']
const skillKeywords = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'HTML',
  'CSS', 'SQL', 'PostgreSQL', 'MongoDB', 'AWS', 'Docker', 'Git', 'REST API',
  'GraphQL', 'UI', 'UX', 'Testing', 'CI/CD', 'Machine Learning', 'AI', 'Azure'
]

const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim()

const extractionRegex = {
  email: /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i,
  phone: /(\+?[0-9][0-9\s().-]{7,}[0-9])/, 
}

const extractName = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const candidates = lines.filter((line) => line.length < 60 && !/[|]{3,}/.test(line))

  for (const line of candidates) {
    if (extractionRegex.email.test(line) || extractionRegex.phone.test(line)) {
      continue
    }

    const words = line.split(/\s+/)
    if (words.length <= 4 && words.length >= 2) {
      return line
    }
  }

  return candidates[0] || 'Unknown'
}

const extractEmail = (text: string) => text.match(extractionRegex.email)?.[1] || ''
const extractPhone = (text: string) => text.match(extractionRegex.phone)?.[1] || ''

const monthMap: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
}

const normalizeDateValue = (value: string) => {
  const text = value.trim()

  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  const slashMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]
    return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`
  }

  const monthMatch = text.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)
  if (monthMatch) {
    const month = monthMap[monthMatch[1].toLowerCase()]
    if (month) {
      return `${monthMatch[3]}-${month}-${monthMatch[2].padStart(2, '0')}`
    }
  }

  return ''
}

const extractDob = (text: string) => {
  const datePatterns = [
    /(?:date of birth|dob|born)\s*[:#-]?\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    /(?:date of birth|dob|born)\s*[:#-]?\s*([A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i,
    /(?:date of birth|dob|born)\s*[:#-]?\s*([0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2})/i,
  ]

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return normalizeDateValue(match[1])
    }
  }

  return ''
}

const extractExperience = (text: string) => {
  const patterns = [
    /(?:experience|professional experience|work experience)\s*[:\-]?\s*([0-9]{1,2})(?:\+)?\s*(?:years?|yrs?|yr)/i,
    /([0-9]{1,2})(?:\+)?\s*(?:years?|yrs?|yr)\s*(?:of\s*)?(?:relevant\s*)?experience/i,
    /([0-9]{1,2})(?:\+)?\s*(?:years?|yrs?|yr)\s*(?:of\s*)?(?:work|professional)\s*(?:experience)?/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return Number(match[1])
    }
  }

  return null
}

const extractLocation = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  const findValue = (label: string) => {
    const patterns = [
      new RegExp(`${label}[:\-]\s*([^\n]+)`, 'i'),
      new RegExp(`\b${label}\b[^\n]{0,30}([A-Za-z][A-Za-z\s,.-]+)`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match?.[1]) {
        return match[1].replace(/[|]/g, '').trim()
      }
    }

    for (const line of lines) {
      if (line.toLowerCase().includes(label.toLowerCase())) {
        const parts = line.split(/[:\-]/)
        if (parts.length > 1) {
          return parts[1].trim()
        }
      }
    }

    return ''
  }

  return {
    city: findValue('city'),
    state: findValue('state'),
    country: findValue('country'),
  }
}

const extractSkills = (text: string) => {
  const found = new Set<string>()
  const sectionMatch = text.match(/(?:skills?|technologies?)[:\n](.*?)(?:\n\n|\n[A-Z][A-Za-z]+:|$)/is)
  const sectionText = sectionMatch?.[1] || text

  for (const skill of skillKeywords) {
    if (sectionText.toLowerCase().includes(skill.toLowerCase())) {
      found.add(skill)
    }
  }

  const tokens = sectionText.split(/[,;|\n]/)
  tokens.forEach((token) => {
    const clean = token.trim()
    if (clean.length > 1 && clean.length < 25) {
      if (/^[A-Za-z0-9./+#-]+$/.test(clean)) {
        found.add(clean)
      }
    }
  })

  return Array.from(found).slice(0, 12)
}

const extractSummary = (text: string) => {
  const sentences = text
    .split(/\n{2,}|\.(?=\s|$)/)
    .map((item) => normalizeText(item))
    .filter(Boolean)

  const summary = sentences.find((item) => item.length > 40 && item.length < 280)
  return summary || sentences[0] || 'No summary extracted'
}

const readPdfText = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const textChunks: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    textChunks.push(pageText)
  }

  return textChunks.join('\n')
}

const readDocxText = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

const readRtfText = async (file: File) => {
  const buffer = await file.arrayBuffer()

  const doc = new RTFJS.Document(buffer, {
    onPicture: (_isLegacy, create) => create(),
    onHyperlink: (create) => ({
      element: create(),
      content: create(),
    }),
  })

  const rendered = await doc.render()
  return rendered
    .map((element) => element.textContent || '')
    .join('\n')
}

const parseResumeFile = async (file: File): Promise<ParsedResume> => {
  const type = file.name.split('.').pop()?.toLowerCase() || ''
  const normalizedType = type === 'docx' || type === 'doc' || type === 'pdf' || type === 'rtf'
    ? type
    : 'txt'

  let extractedText = ''

  if (normalizedType === 'pdf') {
    extractedText = await readPdfText(file)
  } else if (normalizedType === 'docx') {
    extractedText = await readDocxText(file)
  } else if (normalizedType === 'rtf') {
    extractedText = await readRtfText(file)
  } else {
    extractedText = await file.text()
  }

  const cleanedText = normalizeText(extractedText)
  const location = extractLocation(cleanedText)

  return {
    fileName: file.name,
    fileType: normalizedType,
    extractedText: cleanedText,
    name: extractName(cleanedText),
    email: extractEmail(cleanedText),
    phone: extractPhone(cleanedText),
    city: location.city,
    state: location.state,
    country: location.country,
    skills: extractSkills(cleanedText),
    summary: extractSummary(cleanedText),
    experience: extractExperience(cleanedText),
    dob: extractDob(cleanedText),
  }
}

function UploadPage({ supabase }: { supabase: any }) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedResume | null>(null)
  const [editable, setEditable] = useState<ParsedResume | null>(null)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFile = async (selectedFile: File | null) => {
    if (!selectedFile) return

    if (!allowedTypes.includes(`.${selectedFile.name.split('.').pop()?.toLowerCase() || ''}`)) {
      setError('Please select a PDF, DOCX, DOC, or RTF resume.')
      return
    }

    setFile(selectedFile)
    setError('')
    setLoading(true)
    setParsed(null)
    setEditable(null)
    setSaveStatus('')

    try {
      const data = await parseResumeFile(selectedFile)
      setParsed(data)
      setEditable(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the resume.')
    } finally {
      setLoading(false)
    }
  }

  const updateEditable = (changes: Partial<ParsedResume>) => {
    setEditable((current) => (current ? { ...current, ...changes } : current))
  }

  const saveToDatabase = async () => {
    const resumeToSave = editable ?? parsed

    if (!supabase || !resumeToSave) {
      setSaveStatus('Database is not configured yet. Add your Supabase credentials to the environment.')
      return
    }

    setSaveStatus('Saving...')

    const payload = {
      file_name: resumeToSave.fileName,
      name: resumeToSave.name || null,
      email: resumeToSave.email || null,
      phone: resumeToSave.phone || null,
      city: resumeToSave.city || null,
      state: resumeToSave.state || null,
      country: resumeToSave.country || null,
      skills: resumeToSave.skills || [],
      summary: resumeToSave.summary || null,
      raw_text: resumeToSave.extractedText || null,
      experience: Number.isFinite(resumeToSave.experience) ? resumeToSave.experience : null,
      dob: resumeToSave.dob || null,
    }

    const { error } = await supabase.from('resumes').insert(payload)

    if (error) {
      setSaveStatus(`Save failed: ${error.message}`)
      return
    }

    setSaveStatus('Resume saved successfully.')
  }

  return (
    <div className="page-grid">
      <section className="panel uploader-panel">
        <div className="panel-header">
          <p className="eyebrow">Resume intake</p>
          <h1>Extract candidate details</h1>
        </div>

        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            void handleFile(event.dataTransfer.files?.[0] ?? null)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.rtf"
            hidden
            onChange={(event) => {
              void handleFile(event.target.files?.[0] ?? null)
            }}
          />
          <span>Drag & drop a resume here</span>
          <small>or click to browse</small>
        </div>

        {file && <p className="file-name">Selected: {file.name}</p>}

        {error && <p className="error-text">{error}</p>}
        {loading && <p className="loading-text">Parsing resume...</p>}

        {editable && (
          <>
            <div className="fields-grid editor-grid">
              <label className="editor-field">
                <span className="field-label">Name</span>
                <input
                  value={editable.name}
                  onChange={(event) => updateEditable({ name: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">Email</span>
                <input
                  value={editable.email}
                  onChange={(event) => updateEditable({ email: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">Phone</span>
                <input
                  value={editable.phone}
                  onChange={(event) => updateEditable({ phone: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">City</span>
                <input
                  value={editable.city}
                  onChange={(event) => updateEditable({ city: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">State</span>
                <input
                  value={editable.state}
                  onChange={(event) => updateEditable({ state: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">Country</span>
                <input
                  value={editable.country}
                  onChange={(event) => updateEditable({ country: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span className="field-label">Experience (years)</span>
                <input
                  type="number"
                  min="0"
                  value={editable.experience ?? ''}
                  onChange={(event) =>
                    updateEditable({
                      experience: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="editor-field">
                <span className="field-label">Date of Birth</span>
                <input
                  type="date"
                  value={editable.dob}
                  onChange={(event) => updateEditable({ dob: event.target.value })}
                />
              </label>
            </div>

            <label className="editor-field editor-field--full">
              <span className="field-label">Skills</span>
              <input
                value={editable.skills.join(', ')}
                onChange={(event) =>
                  updateEditable({
                    skills: event.target.value
                      .split(',')
                      .map((skill) => skill.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>

            <label className="editor-field editor-field--full">
              <span className="field-label">Summary</span>
              <textarea
                rows={5}
                value={editable.summary}
                onChange={(event) => updateEditable({ summary: event.target.value })}
              />
            </label>

            <div className="skills-row">
              {editable.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>

            <button className="save-button" type="button" onClick={() => void saveToDatabase()}>
              Save corrected data
            </button>
            {saveStatus && <p className="save-status">{saveStatus}</p>}
          </>
        )}
      </section>

      <section className="panel preview-panel">
        <div className="panel-header">
          <p className="eyebrow">Preview</p>
          <h2>Extracted text</h2>
        </div>
        <pre>{parsed?.extractedText || 'Upload a file to preview its text'}</pre>
      </section>
    </div>
  )
}

function SearchPage({ supabase }: { supabase: any }) {
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<ResumeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchData = async () => {
    if (!supabase) {
      setError('Supabase credentials are missing. Configure your environment variables first.')
      return
    }

    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setRecords(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const filteredRecords = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return records

    return records.filter((record) =>
      [
        record.id,
        record.file_name,
        record.name,
        record.email,
        record.phone,
        record.city,
        record.state,
        record.country,
        record.summary,
        record.raw_text,
        record.skills.join(' '),
        record.experience,
        record.dob,
        record.created_at,
      ]
        .join(' ')
        .toLowerCase()
        .includes(value),
    )
  }, [query, records])

  return (
    <div className="search-page">
      <section className="panel search-panel">
        <div className="panel-header">
          <p className="eyebrow">Database</p>
          <h1>Search saved resumes</h1>
        </div>

        <input
          className="search-input"
          placeholder="Search by name, email, phone, skills, or filename"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {error && <p className="error-text">{error}</p>}
        {loading && <p className="loading-text">Loading records...</p>}

        <div className="record-list">
          {filteredRecords.map((record) => (
            <article key={record.id} className="record-card">
              <div>
                <p className="record-file">{record.file_name}</p>
                <h3>{record.name || 'Unnamed candidate'}</h3>
              </div>
              <div className="record-meta">
                <span>{record.email || 'No email'}</span>
                <span>{record.phone || 'No phone'}</span>
                <span>{new Date(record.created_at).toLocaleDateString()}</span>
              </div>
              <div className="record-meta record-meta--secondary">
                <span>{[record.city, record.state, record.country].filter(Boolean).join(', ') || 'Location not provided'}</span>
                <span>{record.experience != null ? `${record.experience} years` : 'Experience not provided'}</span>
                <span>{record.dob ? new Date(record.dob).toLocaleDateString() : 'DOB not provided'}</span>
              </div>
              <p className="record-summary">{record.summary || 'No summary available'}</p>
              <div className="skills-row">
                {record.skills.map((skill) => (
                  <span key={`${record.id}-${skill}`}>{skill}</span>
                ))}
              </div>
              {record.raw_text && (
                <details className="record-details">
                  <summary>View raw text</summary>
                  <pre>{record.raw_text}</pre>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function App() {
  const [supabaseKey, setSupabaseKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [configMessage, setConfigMessage] = useState('')
  const [showKeySetup, setShowKeySetup] = useState(false)

  const supabase = useMemo<any>(() => {
    if (!supabaseUrl || !supabaseKey) {
      return null
    }

    return createClient(supabaseUrl, supabaseKey)
  }, [supabaseKey])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const savedKey = window.localStorage.getItem(storageKey)
    if (savedKey) {
      setSupabaseKey(savedKey)
      setKeyInput(savedKey)
      return
    }

    setShowKeySetup(true)
    setConfigMessage('Enter your Supabase anonymous key to continue.')
  }, [])

  const saveSupabaseKey = () => {
    const trimmedKey = keyInput.trim()

    if (!trimmedKey) {
      setConfigMessage('Please enter a valid Supabase anonymous key.')
      return
    }

    setSupabaseKey(trimmedKey)
    setShowKeySetup(false)
    setConfigMessage('')
    window.localStorage.setItem(storageKey, trimmedKey)
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL || '/'}>
      <header className="app-header">
        <div>
          <p className="eyebrow">Resume scanner</p>
          <h2>Data extractor</h2>
        </div>
        <nav>
          <Link to="/">Upload</Link>
          <Link to="/search">Search</Link>
        </nav>
      </header>

      {showKeySetup && (
        <section className="panel config-panel">
          <p className="eyebrow">Database setup</p>
          <h3>Supabase anonymous key</h3>
          <input
            className="config-input"
            type="password"
            placeholder="Paste your anon key here"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
          />
          <button className="save-button" type="button" onClick={saveSupabaseKey}>
            Save key
          </button>
        </section>
      )}

      {configMessage && <p className="error-text config-banner">{configMessage}</p>}

      <main>
        <Routes>
          <Route path="/" element={<UploadPage supabase={supabase} />} />
          <Route path="/search" element={<SearchPage supabase={supabase} />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
