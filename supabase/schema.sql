create extension if not exists pgcrypto;

drop table if exists public.operational_expenses cascade;
drop table if exists public.driver_trips cascade;
drop table if exists public.maintenances cascade;
drop table if exists public.fuelings cascade;
drop table if exists public.vehicles cascade;
drop table if exists public.profiles cascade;

create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 avatar_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.vehicles(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 brand text not null, model text not null, year integer, plate text,
 fuel_type text not null default 'gasolina' check(fuel_type in('gasolina','alcool','gnv')),
 odometer numeric not null default 0 check(odometer>=0),
 active boolean not null default true, created_at timestamptz not null default now()
);

create table public.fuelings(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 date date not null, odometer numeric not null check(odometer>=0),
 fuel_type text not null check(fuel_type in('gasolina','alcool','gnv')),
 quantity numeric not null check(quantity>0), price_per_unit numeric not null check(price_per_unit>=0),
 total numeric not null check(total>=0), full_tank boolean not null default true,
 station text, notes text, created_at timestamptz not null default now()
);

create table public.maintenances(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 date date not null, odometer numeric not null check(odometer>=0),
 category text not null, service text not null,
 parts numeric not null default 0 check(parts>=0), labor numeric not null default 0 check(labor>=0),
 next_odometer numeric, next_date date, notes text, created_at timestamptz not null default now()
);

create table public.driver_trips(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 date date not null, platform text not null check(platform in('uber','99','particular')),
 gross numeric not null default 0 check(gross>=0), platform_fee numeric not null default 0 check(platform_fee>=0),
 other_expenses numeric not null default 0 check(other_expenses>=0),
 odometer_start numeric, odometer_end numeric, hours_worked numeric default 0 check(hours_worked>=0),
 trip_count integer default 0 check(trip_count>=0), payment_method text, notes text,
 created_at timestamptz not null default now()
);

create table public.operational_expenses(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 date date not null,
 category text not null check(category in('lanche','refeicao','pedagio','estacionamento','lavagem','outros')),
 description text not null, amount numeric not null check(amount>=0), odometer numeric, notes text,
 created_at timestamptz not null default now()
);

create index vehicles_user_idx on public.vehicles(user_id);
create index fuelings_user_date_idx on public.fuelings(user_id,date desc);
create index maintenances_user_date_idx on public.maintenances(user_id,date desc);
create index driver_trips_user_date_idx on public.driver_trips(user_id,date desc);
create index expenses_user_date_idx on public.operational_expenses(user_id,date desc);

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.fuelings enable row level security;
alter table public.maintenances enable row level security;
alter table public.driver_trips enable row level security;
alter table public.operational_expenses enable row level security;

create policy profiles_owner_all on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);
create policy vehicles_owner_all on public.vehicles for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy fuelings_owner_all on public.fuelings for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy maintenances_owner_all on public.maintenances for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy driver_trips_owner_all on public.driver_trips for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy expenses_owner_all on public.operational_expenses for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

insert into storage.buckets(id,name,public) values('avatars','avatars',true)
on conflict(id) do update set public=true;
create policy avatar_public_read on storage.objects for select using(bucket_id='avatars');
create policy avatar_own_insert on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_own_update on storage.objects for update to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_own_delete on storage.objects for delete to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict(id) do nothing; return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_active_vehicle()
returns trigger language plpgsql security invoker as $$
begin
 if new.active then update public.vehicles set active=false where user_id=new.user_id and id<>new.id; end if;
 return new;
end; $$;
create trigger trg_active_vehicle before insert or update on public.vehicles
for each row execute function public.set_active_vehicle();
