# Resume Scanner

A React + Vite app that extracts key details from resume files, saves them to a hosted database, and lets you search the stored records.

## Supported file types
- PDF
- DOCX
- DOC
- RTF

## Database setup
Create a Supabase project and run this SQL:

```sql
create table if not exists resumes (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  name text,
  email text,
  phone text,
  skills text[] default '{}',
  summary text,
  raw_text text,
  created_at timestamp with time zone default now()
);
```

## Environment variables
Copy [.env.example](.env.example) to `.env` and fill in your Supabase credentials.

## Deploying to GitHub Pages
1. Set `base` to your repository name in [vite.config.ts](vite.config.ts).
2. Run `npm run deploy`.
