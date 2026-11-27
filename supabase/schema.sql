-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Crée la table qui reçoit les demandes du formulaire de contact.

create table if not exists public.demandes_partenariat (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  nom           text not null check (char_length(nom) between 1 and 120),
  entreprise    text check (char_length(entreprise) <= 160),
  email         text not null check (char_length(email) <= 200 and email like '%_@_%._%'),
  telephone     text check (char_length(telephone) <= 30),
  formule       text check (formule in ('M''accompagner dans ma saison','Proposition de marque ou de matériel','Presse ou média','Autre')),
  message       text check (char_length(message) <= 2000),
  consentement  boolean not null check (consentement = true),
  statut        text not null default 'Nouveau'   -- à modifier à la main : Nouveau / Contacté / RDV / Signé / Sans suite
);

-- Sécurité : le site peut seulement AJOUTER une demande. Personne ne peut les lire depuis le site.
alter table public.demandes_partenariat enable row level security;

drop policy if exists "Le site peut déposer une demande" on public.demandes_partenariat;
create policy "Le site peut déposer une demande"
  on public.demandes_partenariat
  for insert
  to anon
  with check (consentement = true and statut = 'Nouveau');

revoke select, update, delete on public.demandes_partenariat from anon;
grant insert on public.demandes_partenariat to anon;

-- Petite fonction appelée deux fois par semaine par GitHub (.github/workflows/supabase-eveil.yml)
-- pour que le projet gratuit ne se mette pas en pause faute d'activité.
create or replace function public.ping() returns integer language sql stable as $$ select 1 $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon;
