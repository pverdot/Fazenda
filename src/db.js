// Camada de dados: Supabase (Postgres) protegido por RLS.
// App de um dono só: em vez de login, o navegador guarda a "chave de Arkad" e a envia no
// header x-arkad. O banco compara o sha256 da chave com o hash guardado em privado.chave.
// Sem a chave certa, toda leitura volta vazia e toda escrita é recusada.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_KEY;
const LS = 'escravos-dourados:chave';

export function lerChaveDaUrl() {
  const m = location.hash.match(/chave=([A-Za-z0-9_-]+)/);
  if (!m) return;
  try { localStorage.setItem(LS, m[1]); } catch (_) {}
  history.replaceState(null, '', location.pathname + location.search);
}
const chaveSalva = () => { try { return localStorage.getItem(LS); } catch (_) { return null; } };
export function esquecerChave() { try { localStorage.removeItem(LS); } catch (_) {} }

function cliente(chave) {
  return createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-arkad': chave } },
  });
}
async function valida(chave) {
  const { data, error } = await cliente(chave).rpc('chave_ok');
  if (error) throw error;
  return data === true;
}

// Mostra o portão até a chave ser válida; resolve com o cliente pronto.
export async function conectar() {
  let chave = chaveSalva();
  if (chave) {
    try { if (await valida(chave)) return cliente(chave); }
    catch (_) { return portao('Não consegui falar com o banco. Confira a conexão e recarregue.'); }
    esquecerChave();
  }
  return portao(chave ? 'Essa chave não abre o tesouro. Use o link de acesso.' : '');
}

function portao(erro) {
  return new Promise(resolve => {
    const el = document.getElementById('portao');
    const inp = document.getElementById('portaoChave');
    const msg = document.getElementById('portaoMsg');
    el.hidden = false; msg.textContent = erro;
    document.getElementById('portaoForm').onsubmit = async e => {
      e.preventDefault();
      const c = inp.value.trim().replace(/^.*chave=/, '');
      if (!c) return;
      msg.textContent = 'Conferindo a chave…';
      try {
        if (await valida(c)) {
          try { localStorage.setItem(LS, c); } catch (_) {}
          el.hidden = true; resolve(cliente(c));
        } else msg.textContent = 'Essa chave não abre o tesouro.';
      } catch (_) { msg.textContent = 'Não consegui falar com o banco. Tente de novo.'; }
    };
    inp.focus();
  });
}

const falha = (error, padrao = 'invalid_argument') => { if (error) { const e = new Error(error.message); e.code = error.code === '42501' ? 'invalid_argument' : padrao; throw e; } };

export async function carregar(sb) {
  const [c, s, o] = await Promise.all([
    sb.from('censos').select('payload').order('data'),
    sb.from('serie').select('pontos').eq('id', 1).maybeSingle(),
    sb.from('ordens').select('*'),
  ]);
  falha(c.error, 'unavailable'); falha(s.error, 'unavailable'); falha(o.error, 'unavailable');
  return {
    censos: c.data.map(r => r.payload),
    serie: s.data ? s.data.pontos : null,
    ordens: o.data.map(r => ({ ...r, qtd: +r.qtd, preco: +r.preco, seq: r.seq == null ? null : +r.seq, _id: r.id })),
  };
}

// Mesma forma de chamada que a página usava (doc/collection), agora sobre Postgres.
export function adaptador(sb, aoMudar) {
  const feito = async p => { const { error } = await p; falha(error); aoMudar(); };
  const doc = caminho => {
    const [col, id] = caminho.split('/');
    if (col === 'censos') return {
      set: c => feito(sb.from('censos').upsert({ data: id, payload: c, patrimonio: c.patrimonio ?? null, registrado_em: new Date().toISOString() })),
      delete: () => feito(sb.from('censos').delete().eq('data', id)),
    };
    if (col === 'historico') return {
      set: s => feito(sb.from('serie').upsert({ id: 1, atualizado_em: s.atualizadoEm, pontos: s.pontos })),
    };
    if (col === 'ordens') return {
      set: o => feito(sb.from('ordens').upsert({ id, data: o.data ?? null, ref: o.ref ?? null, ativo: o.ativo, tipo: o.tipo, qtd: o.qtd, preco: o.preco, status: o.status, fonte: o.fonte ?? null, nota: o.nota ?? null, seq: o.seq ?? null })),
      update: patch => feito(sb.from('ordens').update(patch).eq('id', id)),
      delete: () => feito(sb.from('ordens').delete().eq('id', id)),
    };
    throw new Error('caminho desconhecido: ' + caminho);
  };
  return { doc, collection: col => ({ doc: id => doc(col + '/' + id) }) };
}
