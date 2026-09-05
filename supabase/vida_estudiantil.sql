-- VIDA ESTUDIANTIL · GRADUANDOS 2026 · C.E.B.G. EL JIRAL
-- Ejecutar una sola vez en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.vida_estudiantil_recuerdos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estudiante_id text,
  nombre_estudiante text not null,
  salon text not null check (salon in ('9A','9B','9C')),
  categoria text not null,
  titulo text not null,
  tipo text not null check (tipo in ('foto','video')),
  ruta_storage text not null,
  mime_type text,
  peso_bytes bigint,
  descripcion text check (char_length(coalesce(descripcion,'')) <= 180),
  profesor text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  motivo_rechazo text check (char_length(coalesce(motivo_rechazo,'')) <= 300),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  revisado_en timestamptz,
  unique(usuario_id,categoria)
);

create index if not exists vida_estudiantil_estado_idx on public.vida_estudiantil_recuerdos(estado);
create index if not exists vida_estudiantil_salon_idx on public.vida_estudiantil_recuerdos(salon);
alter table public.vida_estudiantil_recuerdos enable row level security;

create or replace function public.es_admin_vida_estudiantil()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.rol='admin') $$;

revoke all on function public.es_admin_vida_estudiantil() from public;
grant execute on function public.es_admin_vida_estudiantil() to authenticated;

drop policy if exists "vida_estudiante_ve_suyo" on public.vida_estudiantil_recuerdos;
create policy "vida_estudiante_ve_suyo" on public.vida_estudiantil_recuerdos for select to authenticated
using (usuario_id=auth.uid() or estado='aprobado' or public.es_admin_vida_estudiantil());

drop policy if exists "vida_estudiante_inserta_suyo" on public.vida_estudiantil_recuerdos;
create policy "vida_estudiante_inserta_suyo" on public.vida_estudiantil_recuerdos for insert to authenticated
with check (usuario_id=auth.uid() and estado='pendiente');

drop policy if exists "vida_estudiante_actualiza_suyo" on public.vida_estudiantil_recuerdos;
create policy "vida_estudiante_actualiza_suyo" on public.vida_estudiantil_recuerdos for update to authenticated
using (usuario_id=auth.uid() and estado<>'aprobado')
with check (usuario_id=auth.uid() and estado='pendiente');
drop policy if exists "vida_admin_actualiza" on public.vida_estudiantil_recuerdos;
create policy "vida_admin_actualiza" on public.vida_estudiantil_recuerdos for update to authenticated
using (public.es_admin_vida_estudiantil()) with check (public.es_admin_vida_estudiantil());

drop policy if exists "vida_estudiante_elimina_suyo" on public.vida_estudiantil_recuerdos;
create policy "vida_estudiante_elimina_suyo" on public.vida_estudiantil_recuerdos for delete to authenticated
using ((usuario_id=auth.uid() and estado<>'aprobado') or public.es_admin_vida_estudiantil());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vida-estudiantil','vida-estudiantil',false,26214400,array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "vida_storage_leer" on storage.objects;
create policy "vida_storage_leer" on storage.objects for select to authenticated
using (bucket_id='vida-estudiantil' and ((storage.foldername(name))[1]=auth.uid()::text or public.es_admin_vida_estudiantil() or exists(select 1 from public.vida_estudiantil_recuerdos r where r.ruta_storage=name and r.estado='aprobado')));

drop policy if exists "vida_storage_subir" on storage.objects;
create policy "vida_storage_subir" on storage.objects for insert to authenticated
with check (bucket_id='vida-estudiantil' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "vida_storage_actualizar" on storage.objects;
create policy "vida_storage_actualizar" on storage.objects for update to authenticated
using (bucket_id='vida-estudiantil' and ((storage.foldername(name))[1]=auth.uid()::text or public.es_admin_vida_estudiantil()))
with check (bucket_id='vida-estudiantil' and ((storage.foldername(name))[1]=auth.uid()::text or public.es_admin_vida_estudiantil()));

drop policy if exists "vida_storage_eliminar" on storage.objects;
create policy "vida_storage_eliminar" on storage.objects for delete to authenticated
using (bucket_id='vida-estudiantil' and ((storage.foldername(name))[1]=auth.uid()::text or public.es_admin_vida_estudiantil()));

grant select,insert,update,delete on public.vida_estudiantil_recuerdos to authenticated;
