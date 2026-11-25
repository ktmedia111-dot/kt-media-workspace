-- Only active, approved administrators can delete tasks, and only after completion.
grant delete on table public.urgent_tasks to authenticated;

drop policy if exists "Approved admins can delete completed urgent tasks"
  on public.urgent_tasks;

create policy "Approved admins can delete completed urgent tasks"
  on public.urgent_tasks
  for delete
  to authenticated
  using (
    completed is true
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.approved is true
        and coalesce(p.active, true) is true
    )
  );
