# TBORGES Gestão Inteligente — início do zero

## 1. Supabase
No projeto Supabase escolhido para este aplicativo:
- abra **SQL Editor**;
- crie uma consulta vazia;
- abra `supabase/schema.sql`;
- copie tudo e cole no SQL Editor;
- clique em **Run**.

O resultado esperado é **Success / No rows returned**.

> O script recria as quatro tabelas do aplicativo. Portanto, use este arquivo apenas para a nova instalação/reinício.

Em **Table Editor > schema public**, devem aparecer:
- `vehicles`
- `fuelings`
- `maintenances`
- `driver_trips`

## 2. Chaves do Supabase
Em **Project Settings > API**, copie:
- Project URL
- Publishable key (`sb_publishable_...`)

No Vercel, cadastre como:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Não use a Secret/service_role key no navegador.

## 3. Vercel
Envie esta pasta como projeto Vite e configure as duas variáveis antes do Deploy.
