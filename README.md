# Fazenda · Escravos Dourados

Tesouraria pessoal à moda de Arkad (*O Homem Mais Rico da Babilônia*): cada R$ 1.000 do patrimônio é um escravo dourado. O app mostra quem está trabalhando, quem fugiu, a crônica do rendimento desde 2022, os censos ao longo do tempo e o livro de ordens de compra.

## Stack e decisões

| Peça | Escolha | Por quê |
|---|---|---|
| Front | Vite + JS puro, uma página | O app nasceu como artefato HTML; manter JS puro preserva 100% da lógica e dos gráficos (SVG/Canvas feitos à mão), sem reescrever em framework. |
| Banco | Supabase Postgres, projeto `escravos-dourados` (sa-east-1) | Separado dos bancos da DOP: dado pessoal não divide projeto com empresa. |
| Acesso | Chave de Arkad no header `x-arkad` + RLS | App de um dono só. Em vez de login com e-mail/senha, o navegador guarda uma chave longa aberta uma vez por link (`/#chave=...`). O Postgres compara o sha256 da chave com `privado.chave`; sem ela, leituras voltam vazias e escritas são recusadas. A chave publicável do Supabase pode ficar no front, porque sozinha não lê nada. |
| Planilhas | SheetJS no navegador | Os relatórios do banco (.xlsx) são lidos no próprio navegador; nada de arquivo sobe para servidor. |
| Deploy | Vercel ligada a este repo | Todo push na `main` publica. |

## Dados

- `censos` — um por dia; `payload` guarda o relatório normalizado (ativos, produtos, categorias).
- `serie` — crônica diária da rentabilidade acumulada (substituída a cada envio do relatório).
- `ordens` — livro de ordens (compra, venda, aplicação; executada, pendente, cancelada).

Schema em `supabase/migrations/`.

## Rodar local

```bash
cp .env.example .env
npm install
npm run dev
```

Abra `http://localhost:5173/#chave=SUA_CHAVE` uma vez.

## Atualizar

1. Exporte do banco: Rentabilidade acumulada, Seus ativos, Meus produtos.
2. Aba Tesouraria → seção VIII → solte os três .xlsx → Registrar censo.
3. Ordens: aba Ordens de compra → importar extrato ou lançar à mão.
