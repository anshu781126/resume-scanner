# NHN Solutions Resume Scanner

A React + Vite app that extracts key details from resume files, saves them to a hosted database, and lets you search the stored records.

## Supported file types
- PDF
- DOCX
- DOC
- RTF

## Database setup
Create a Supabase project and run this SQL in the SQL editor:

```sql
create table if not exists resumes (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  name text,
  email text,
  phone text,
  city text,
  state text,
  country text,
  skills text[] default '{}',
  summary text,
  raw_text text,
  experience int,
  dob date,
  created_at timestamp with time zone default now()
);
```

If you want the app to insert data from the browser using the anonymous key, allow writes for the table (for example, disable RLS or add a policy that permits inserts).

## Environment variables
The app reads the Supabase settings from `.env`. A working template is already provided in [.env.example](.env.example).

## Deploying to GitHub Pages
1. Set `base` to your repository name in [vite.config.ts](vite.config.ts).
2. Enable GitHub Pages in the repository settings and choose the `GitHub Actions` source.
3. Push to `main` (or run the workflow manually) to publish automatically.

The repository includes a workflow in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
