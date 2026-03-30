-- Projects table
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  status text default 'active' check (status in ('active','on_hold','completed','archived')),
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  owner text,
  start_date date,
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_groups (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  position integer default 0,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text default 'todo' check (status in ('todo','in_progress','blocked','done')),
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  project_id uuid references projects(id) on delete set null,
  group_id uuid references task_groups(id) on delete set null,
  assigned_to text,
  due_date date,
  source text default 'manual' check (source in ('manual','email','teams','teamsmaestro')),
  message_id text unique,
  depends_on uuid references tasks(id) on delete set null,
  notes text,
  position integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;
alter table task_groups enable row level security;
alter table tasks enable row level security;

create policy "allow all" on projects for all using (true) with check (true);
create policy "allow all" on task_groups for all using (true) with check (true);
create policy "allow all" on tasks for all using (true) with check (true);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tasks_updated_at before update on tasks for each row execute function update_updated_at();
create trigger projects_updated_at before update on projects for each row execute function update_updated_at();
