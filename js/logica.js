/*
 * Follow-up de Planos de Ação — regras de negócio (sem acesso à tela).
 * Este arquivo roda no navegador (window.FollowUp) e no Node (testes automáticos).
 * Nada aqui acessa a internet.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FollowUp = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MS_DIA = 86400000;

  // ------------------------------------------------------------------
  // Texto
  // ------------------------------------------------------------------
  function normalizeKey(str) {
    return String(str === null || str === undefined ? '' : str)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, m => map[m]);
  }

  function hashTexto(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // ------------------------------------------------------------------
  // Datas
  // ------------------------------------------------------------------
  function dataLocal(ano, mes, dia) {
    const d = new Date(ano, mes - 1, dia);
    d.setHours(0, 0, 0, 0);
    // Rejeita datas impossíveis (ex.: 31/02), que o JavaScript "rolaria" para março.
    if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
    return d;
  }

  function parseDate(val) {
    if (val === null || val === undefined || val === '') return null;

    if (val instanceof Date) {
      if (isNaN(val)) return null;
      // Arredonda ao minuto: a leitura do Excel pode vir com segundos de diferença da meia-noite.
      const d = new Date(Math.round(val.getTime() / 60000) * 60000);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    if (typeof val === 'number') {
      // Número de série do Excel (dias desde 30/12/1899).
      if (!isFinite(val) || val < 1 || val > 2958465) return null;
      const u = new Date(Math.round((Math.floor(val) - 25569) * MS_DIA));
      return dataLocal(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
    }

    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return null;
      let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\D.*)?$/);
      if (m) return dataLocal(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
      if (m) return dataLocal(2000 + parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
      m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\D.*)?$/);
      if (m) return dataLocal(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      return null; // Sem "adivinhação": formato desconhecido não vira data.
    }

    return null;
  }

  // true quando a célula tem algo escrito que não é uma data válida.
  function dataInvalida(val) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    return parseDate(val) === null;
  }

  function formatDate(d) {
    if (!d || !(d instanceof Date) || isNaN(d)) return '-';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function toIso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fromIso(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? dataLocal(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)) : null;
  }

  function diffDias(a, b) {
    return Math.round((a.getTime() - b.getTime()) / MS_DIA);
  }

  function dateToSerial(d) {
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DIA) + 25569;
  }

  function hoje() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Lista de feriados digitada pelo usuário: uma data por linha (ou separadas por vírgula / ponto e vírgula).
  function parseFeriados(texto) {
    const set = new Set();
    const invalidos = [];
    String(texto || '').split(/[\n,;]+/).forEach(parte => {
      const s = parte.trim();
      if (!s) return;
      const d = parseDate(s.split(/\s+/)[0]);
      if (d) set.add(toIso(d)); else invalidos.push(s);
    });
    return { set, invalidos };
  }

  function addDiasUteis(inicio, n, feriadosSet) {
    const cur = new Date(inicio);
    cur.setHours(0, 0, 0, 0);
    let count = 0;
    while (count < n) {
      cur.setDate(cur.getDate() + 1);
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6 && !(feriadosSet && feriadosSet.has(toIso(cur)))) count++;
    }
    return cur;
  }

  // ------------------------------------------------------------------
  // Configurações
  // ------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    assinatura: 'Equipe de Auditoria Interna & Controles',
    assunto: 'Follow-up de planos de ação – Auditoria Interna',
    diasResposta: 5,
    diasEscalonamento: 60,
    escalonarRiscoAlto: true,
    janelaVencer: 7,
    feriados: '',
    palavrasConcluido: 'concluído, concluída, finalizado, finalizada, implementado, implementada, encerrado, encerrada, fechado, ok',
    palavrasCancelado: 'cancelado, cancelada, não aplicável, descontinuado, baixado'
  };

  function intEntre(v, min, max, padrao) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return padrao;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeConfig(parcial) {
    const p = parcial && typeof parcial === 'object' ? parcial : {};
    const str = (k) => (typeof p[k] === 'string' ? p[k] : DEFAULT_CONFIG[k]);
    return {
      assinatura: str('assinatura').trim() || DEFAULT_CONFIG.assinatura,
      assunto: str('assunto').trim() || DEFAULT_CONFIG.assunto,
      diasResposta: intEntre(p.diasResposta, 1, 60, DEFAULT_CONFIG.diasResposta),
      diasEscalonamento: intEntre(p.diasEscalonamento, 1, 3650, DEFAULT_CONFIG.diasEscalonamento),
      escalonarRiscoAlto: typeof p.escalonarRiscoAlto === 'boolean' ? p.escalonarRiscoAlto : DEFAULT_CONFIG.escalonarRiscoAlto,
      janelaVencer: intEntre(p.janelaVencer, 0, 365, DEFAULT_CONFIG.janelaVencer),
      feriados: str('feriados'),
      palavrasConcluido: str('palavrasConcluido'),
      palavrasCancelado: str('palavrasCancelado')
    };
  }

  function listaPalavras(texto) {
    return String(texto || '').split(/[\n,;]+/).map(normalizeKey).filter(Boolean);
  }

  function casaPalavra(statusNorm, palavras) {
    return palavras.some(w => statusNorm === w || (w.length >= 4 && statusNorm.startsWith(w)));
  }

  // Interpreta o texto da coluna Status: CONCLUIDO, CANCELADO ou ABERTO.
  function interpretarStatus(statusOriginal, cfg) {
    const n = normalizeKey(statusOriginal);
    if (!n) return 'ABERTO';
    if (casaPalavra(n, listaPalavras(cfg.palavrasCancelado))) return 'CANCELADO';
    if (casaPalavra(n, listaPalavras(cfg.palavrasConcluido))) return 'CONCLUIDO';
    return 'ABERTO';
  }

  function nivelRisco(risco) {
    const n = normalizeKey(risco);
    if (['alto', 'alta', 'critico', 'critica', 'high', 'muitoalto', 'extremo'].includes(n)) return 'alto';
    if (['medio', 'media', 'moderado', 'moderada', 'medium'].includes(n)) return 'medio';
    if (['baixo', 'baixa', 'low'].includes(n)) return 'baixo';
    return '';
  }

  // ------------------------------------------------------------------
  // Colunas
  // ------------------------------------------------------------------
  // Colunas que o próprio sistema acrescenta ao exportar; ao reimportar, são ignoradas e recalculadas.
  const COLUNAS_CALCULADAS = ['Status calculado', 'Dias de atraso', 'Prazo vigente', 'Tipo de prazo'];
  const COL_ULTIMA_COBRANCA = 'Última cobrança';
  const COL_NUM_COBRANCAS = 'Nº de cobranças';

  function ehColunaCalculada(nome) {
    const n = normalizeKey(nome);
    return COLUNAS_CALCULADAS.some(c => normalizeKey(c) === n);
  }

  const CAMPOS = [
    { key: 'id', label: 'ID do plano', importante: false },
    { key: 'plano', label: 'Plano de ação', importante: true },
    { key: 'responsavel', label: 'Responsável', importante: true },
    { key: 'email', label: 'E-mail do responsável', importante: true },
    { key: 'gestor', label: 'Gestor (nome)', importante: false },
    { key: 'gestorEmail', label: 'E-mail do gestor', importante: true },
    { key: 'area', label: 'Área', importante: false },
    { key: 'risco', label: 'Risco', importante: true },
    { key: 'status', label: 'Status', importante: true },
    { key: 'prazoAcordado', label: 'Prazo acordado', importante: true },
    { key: 'prazoReprogramado', label: 'Prazo reprogramado', importante: false },
    { key: 'ultimaCobranca', label: 'Última cobrança', importante: false },
    { key: 'numCobrancas', label: 'Nº de cobranças', importante: false }
  ];

  function detectarColunas(colunas) {
    const cols = colunas.filter(c => !ehColunaCalculada(c)).map(c => ({ nome: c, n: normalizeKey(c) }));
    const usados = new Set();
    const achar = (...testes) => {
      for (const t of testes) {
        const c = cols.find(c => !usados.has(c.nome) && t(c.n));
        if (c) { usados.add(c.nome); return c.nome; }
      }
      return '';
    };
    const ehEmail = n => n.includes('email') || n.includes('correio');
    const ehGestor = n => n.includes('gestor') || n.includes('gerente') || n.includes('lider') || n.includes('superior') || n.includes('diretor');

    const m = {};
    m.ultimaCobranca = achar(n => n.includes('ultimacobranca') || n === 'datadacobranca' || n === 'datacobranca');
    m.numCobrancas = achar(n => (n.includes('cobrancas') || n.includes('cobranca')) && (n.startsWith('n') || n.includes('qtd') || n.includes('quantidade') || n.includes('numero')));
    m.gestorEmail = achar(n => ehEmail(n) && ehGestor(n));
    m.email = achar(n => ehEmail(n) && !ehGestor(n));
    m.gestor = achar(n => ehGestor(n) && !ehEmail(n));
    m.prazoReprogramado = achar(n => n.includes('reprogramad') || n.includes('prorrogad') || n.includes('novoprazo') || n.includes('prazorevisado'));
    m.prazoAcordado = achar(
      n => n.includes('acordado') || n.includes('prazooriginal'),
      n => n.includes('prazo') || n === 'datalimite' || n === 'vencimento' || n === 'datadevencimento'
    );
    m.status = achar(n => n === 'status' || n === 'situacao' || n === 'fase', n => n.startsWith('status'));
    m.responsavel = achar(n => n === 'responsavel', n => n.includes('responsavel') || n === 'dono' || n === 'owner');
    m.area = achar(n => n === 'area' || n === 'setor' || n === 'departamento', n => n.startsWith('area'));
    m.risco = achar(n => n === 'risco' || n === 'criticidade' || n === 'nivelderisco' || n === 'prioridade', n => n.includes('risco'));
    m.id = achar(n => n === 'id' || n === 'codigo' || n === 'item' || n === 'numero' || n === 'n' || n === 'cod');
    m.plano = achar(
      n => n === 'planodeacao' || n === 'plano',
      n => n.includes('plano') && !n.includes('observ'),
      n => (n.includes('acao') || n.includes('descricao') || n.includes('titulo') || n.includes('recomendacao')) && !n.includes('observ')
    );
    return m;
  }

  // ------------------------------------------------------------------
  // E-mails
  // ------------------------------------------------------------------
  function separarEmails(str) {
    return String(str || '').split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
  }

  function emailValido(e) {
    return /^[^\s@<>()\[\]",;:]+@[^\s@<>()\[\]",;:]+\.[^\s@<>()\[\]",;:]{2,}$/.test(e);
  }

  function listaEmailsValida(str) {
    const lista = separarEmails(str);
    return lista.length > 0 && lista.every(emailValido);
  }

  // ------------------------------------------------------------------
  // Registro de cobranças
  // ------------------------------------------------------------------
  // Identifica o plano sem guardar nome nem texto: só um código derivado de ID + plano + responsável.
  function chavePlano(customId, plano, responsavel) {
    return hashTexto(normalizeKey(customId) + '|' + normalizeKey(plano) + '|' + normalizeKey(responsavel));
  }

  // Junta o que veio da planilha (última cobrança e quantidade) com o que foi marcado neste navegador.
  function combinarCobrancas(ultimaPlanilha, numPlanilha, datasLocaisIso) {
    const baseN = Math.max(0, parseInt(numPlanilha, 10) || 0);
    const locais = (datasLocaisIso || []).map(fromIso).filter(Boolean).sort((a, b) => a - b);
    const novas = ultimaPlanilha ? locais.filter(d => d.getTime() > ultimaPlanilha.getTime()) : locais;
    let ultima = ultimaPlanilha || null;
    novas.forEach(d => { if (!ultima || d.getTime() > ultima.getTime()) ultima = d; });
    let n = baseN + novas.length;
    if (ultima && n === 0) n = 1; // há data de cobrança, mas a quantidade não foi informada
    return { ultima, n, naoGravadas: novas.length };
  }

  // ------------------------------------------------------------------
  // Processamento das linhas
  // ------------------------------------------------------------------
  function texto(row, col) {
    if (!col) return '';
    const v = row[col];
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function processar(rows, colunas, mapa, cfgBruta, dataHoje, registro) {
    const cfg = normalizeConfig(cfgBruta);
    const today = dataHoje || hoje();
    const reg = registro || {};
    const problemas = [];
    const statusResumo = {};

    const itens = rows.map((row, index) => {
      // Linha real na planilha (a leitura do Excel informa a posição; a linha 1 é o cabeçalho).
      const linha = typeof row.__rowNum__ === 'number' ? row.__rowNum__ + 1 : index + 2;
      const customId = texto(row, mapa.id) || String(index + 1);
      const plano = texto(row, mapa.plano) || ('Plano de ação #' + (index + 1));
      const responsavel = texto(row, mapa.responsavel);
      const area = texto(row, mapa.area);
      const risco = texto(row, mapa.risco);
      const statusOriginal = texto(row, mapa.status);
      const email = texto(row, mapa.email);
      let gestorNome = texto(row, mapa.gestor);
      let gestorEmail = texto(row, mapa.gestorEmail);
      if (!gestorEmail && gestorNome.includes('@')) { gestorEmail = gestorNome; gestorNome = ''; }

      const prob = (tipo, msg) => problemas.push({ linha, id: customId, tipo, msg });

      const brutoAcordado = mapa.prazoAcordado ? row[mapa.prazoAcordado] : '';
      const brutoReprog = mapa.prazoReprogramado ? row[mapa.prazoReprogramado] : '';
      const dataAcordada = parseDate(brutoAcordado);
      const dataReprogramada = parseDate(brutoReprog);

      const interp = interpretarStatus(statusOriginal, cfg);
      const chaveStatus = statusOriginal || '(vazio)';
      if (!statusResumo[chaveStatus]) statusResumo[chaveStatus] = { valor: chaveStatus, qtd: 0, interpretacao: interp };
      statusResumo[chaveStatus].qtd++;

      const aberto = interp === 'ABERTO';

      if (dataInvalida(brutoAcordado)) prob('prazo', 'Prazo acordado "' + String(brutoAcordado).trim() + '" não é uma data válida.');
      if (dataInvalida(brutoReprog)) prob('prazo', 'Prazo reprogramado "' + String(brutoReprog).trim() + '" não é uma data válida.');

      let prazoEfetivo = null;
      let tipoPrazo = '';
      if (dataReprogramada) { prazoEfetivo = dataReprogramada; tipoPrazo = 'Reprogramado'; }
      else if (dataAcordada) { prazoEfetivo = dataAcordada; tipoPrazo = 'Acordado'; }

      let statusKey, statusLabel, diasAtraso = 0, diasRestantes = null;
      if (interp === 'CONCLUIDO') { statusKey = 'CONCLUIDO'; statusLabel = 'Concluído'; }
      else if (interp === 'CANCELADO') { statusKey = 'CANCELADO'; statusLabel = 'Cancelado'; }
      else if (!prazoEfetivo) {
        statusKey = 'SEM_PRAZO'; statusLabel = 'Sem prazo';
        if (!dataInvalida(brutoAcordado) && !dataInvalida(brutoReprog)) prob('prazo', 'Plano em aberto sem prazo informado.');
      } else {
        diasRestantes = diffDias(prazoEfetivo, today);
        if (diasRestantes < 0) { statusKey = 'ATRASADO'; statusLabel = 'Atrasado'; diasAtraso = -diasRestantes; }
        else if (diasRestantes <= cfg.janelaVencer) { statusKey = 'A_VENCER'; statusLabel = diasRestantes === 0 ? 'Vence hoje' : 'Vence em até ' + cfg.janelaVencer + ' dias'; }
        else { statusKey = 'NO_PRAZO'; statusLabel = 'No prazo'; }
      }

      if (aberto) {
        if (!responsavel) prob('responsavel', 'Plano em aberto sem responsável.');
        if (mapa.email && !email) prob('email', 'Sem e-mail do responsável.');
      }
      if (email && !listaEmailsValida(email)) prob('email', 'E-mail do responsável com formato inválido: "' + email + '".');
      if (gestorEmail && !listaEmailsValida(gestorEmail)) prob('email', 'E-mail do gestor com formato inválido: "' + gestorEmail + '".');

      const key = chavePlano(customId, plano, responsavel);
      const ultimaPlanilha = mapa.ultimaCobranca ? parseDate(row[mapa.ultimaCobranca]) : null;
      if (mapa.ultimaCobranca && dataInvalida(row[mapa.ultimaCobranca])) prob('cobranca', 'Data da última cobrança inválida: "' + String(row[mapa.ultimaCobranca]).trim() + '".');
      const numPlanilha = mapa.numCobrancas ? row[mapa.numCobrancas] : 0;
      const cob = combinarCobrancas(ultimaPlanilha, numPlanilha, reg[key]);
      const nivel = nivelRisco(risco);

      return {
        seq: index + 1,
        linha,
        customId,
        key,
        original: row,
        plano,
        responsavel: responsavel || 'Não atribuído',
        semResponsavel: !responsavel,
        area: area || 'Não informada',
        risco: risco || 'Não informado',
        riscoNivel: nivel,
        isRiscoAlto: nivel === 'alto',
        email: listaEmailsValida(email) ? separarEmails(email).join('; ') : '',
        emailBruto: email,
        gestorNome,
        gestorEmail: listaEmailsValida(gestorEmail) ? separarEmails(gestorEmail).join('; ') : '',
        statusOriginal,
        statusKey,
        statusLabel,
        isAberto: aberto,
        isConcluido: interp === 'CONCLUIDO',
        diasAtraso,
        diasRestantes,
        prazoEfetivo,
        tipoPrazo,
        ultimaCobranca: cob.ultima,
        numCobrancas: cob.n,
        cobrancasNaoGravadas: cob.naoGravadas,
        cobradoHoje: !!(cob.ultima && cob.ultima.getTime() === today.getTime())
      };
    });

    // Avisos sobre colunas que fazem falta
    const avisos = [];
    if (!mapa.plano) avisos.push('Coluna do plano de ação não encontrada: os planos aparecerão como "Plano de ação #n".');
    if (!mapa.responsavel) avisos.push('Coluna de responsável não encontrada: não é possível agrupar cobranças por pessoa.');
    if (!mapa.prazoAcordado && !mapa.prazoReprogramado) avisos.push('Nenhuma coluna de prazo encontrada: não é possível calcular atrasos.');
    if (!mapa.status) avisos.push('Coluna de status não encontrada: todos os planos serão tratados como em aberto.');
    if (!mapa.email) avisos.push('Coluna de e-mail do responsável não encontrada: as cobranças sairão sem destinatário (o sistema não inventa endereços).');
    if (!mapa.gestorEmail && !itens.some(i => i.gestorEmail)) avisos.push('Coluna de e-mail do gestor não encontrada: e-mails escalonados sairão sem cópia para o gestor.');
    if (!mapa.risco) avisos.push('Coluna de risco não encontrada: o escalonamento por risco alto não será aplicado.');

    return {
      itens,
      problemas,
      avisos,
      statusResumo: Object.values(statusResumo).sort((a, b) => b.qtd - a.qtd),
      cfg,
      today
    };
  }

  // ------------------------------------------------------------------
  // Ordenação
  // ------------------------------------------------------------------
  function ordenarPadrao(itens) {
    const peso = { ATRASADO: 0, A_VENCER: 1, SEM_PRAZO: 2, NO_PRAZO: 3, CONCLUIDO: 4, CANCELADO: 5 };
    return itens.sort((a, b) => {
      if (peso[a.statusKey] !== peso[b.statusKey]) return peso[a.statusKey] - peso[b.statusKey];
      if (b.diasAtraso !== a.diasAtraso) return b.diasAtraso - a.diasAtraso;
      const ra = a.diasRestantes === null ? Infinity : a.diasRestantes;
      const rb = b.diasRestantes === null ? Infinity : b.diasRestantes;
      if (ra !== rb) return ra - rb;
      return a.seq - b.seq;
    });
  }

  function valorOrdenacao(item, colKey) {
    switch (colKey) {
      case 'seq': return item.seq;
      case 'diasAtraso': return item.diasAtraso;
      case 'statusLabel': return item.statusLabel;
      case 'prazoEfetivo': return item.prazoEfetivo;
      case 'ultimaCobranca': return item.ultimaCobranca;
      case 'numCobrancas': return item.numCobrancas;
    }
    if (colKey.indexOf('orig_') === 0) {
      const v = item.original[colKey.slice(5)];
      if (v instanceof Date) return v;
      if (typeof v === 'string') { const d = parseDate(v); if (d && /^\d/.test(v.trim())) return d; }
      return v;
    }
    return '';
  }

  function ordenarPor(itens, colKey, direcao) {
    const sinal = direcao === 'desc' ? -1 : 1;
    const vazio = v => v === null || v === undefined || v === '';
    return itens.sort((a, b) => {
      const va = valorOrdenacao(a, colKey), vb = valorOrdenacao(b, colKey);
      if (vazio(va) && vazio(vb)) return a.seq - b.seq;
      if (vazio(va)) return 1;   // vazios sempre no fim
      if (vazio(vb)) return -1;
      // Em coluna de datas, texto que não é data (ex.: "a definir") vai para o fim, como os vazios.
      if (va instanceof Date && !(vb instanceof Date)) return -1;
      if (vb instanceof Date && !(va instanceof Date)) return 1;
      let r;
      if (va instanceof Date && vb instanceof Date) r = va.getTime() - vb.getTime();
      else if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
      else r = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return r !== 0 ? r * sinal : a.seq - b.seq;
    });
  }

  // ------------------------------------------------------------------
  // Cobranças
  // ------------------------------------------------------------------
  function itemEscalonado(item, cfg) {
    if (item.statusKey !== 'ATRASADO') return false;
    return item.diasAtraso > cfg.diasEscalonamento || (cfg.escalonarRiscoAlto && item.isRiscoAlto);
  }

  function unicos(lista) {
    const vistos = new Set();
    return lista.filter(v => {
      const k = String(v).toLowerCase();
      if (!v || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }

  function agruparCobrancas(itens, cfgBruta) {
    const cfg = normalizeConfig(cfgBruta);
    const pend = itens.filter(i => i.statusKey === 'ATRASADO' || i.statusKey === 'A_VENCER');

    // Linhas sem e-mail herdam o e-mail da mesma pessoa quando ele é único (não ambíguo).
    const emailsPorNome = {};
    pend.forEach(i => {
      const n = normalizeKey(i.responsavel);
      if (!emailsPorNome[n]) emailsPorNome[n] = new Set();
      if (i.email) emailsPorNome[n].add(i.email.toLowerCase());
    });

    const grupos = {};
    pend.forEach(i => {
      const n = normalizeKey(i.responsavel);
      let email = i.email;
      if (!email && emailsPorNome[n].size === 1) email = [...emailsPorNome[n]][0];
      const chave = n + '|' + email.toLowerCase(); // homônimos com e-mails diferentes ficam separados
      if (!grupos[chave]) grupos[chave] = { chave, responsavel: i.responsavel, email, itens: [] };
      grupos[chave].itens.push(i);
    });

    const lista = Object.values(grupos).map(g => {
      const escalados = g.itens.filter(i => itemEscalonado(i, cfg));
      g.escalonado = escalados.length > 0;
      g.areas = unicos(g.itens.map(i => i.area));
      g.cc = g.escalonado ? unicos(escalados.map(i => i.gestorEmail).join('; ').split('; ')).join('; ') : '';
      g.gestores = unicos(escalados.map(i => i.gestorNome));
      g.cobradoHoje = g.itens.every(i => i.cobradoHoje);
      g.ultimaCobranca = g.itens.reduce((m, i) => (i.ultimaCobranca && (!m || i.ultimaCobranca > m) ? i.ultimaCobranca : m), null);
      g.maxCobrancas = g.itens.reduce((m, i) => Math.max(m, i.numCobrancas), 0);
      g.itens.sort((a, b) => b.diasAtraso - a.diasAtraso || (a.diasRestantes || 0) - (b.diasRestantes || 0));
      return g;
    });

    lista.sort((a, b) => {
      if (a.cobradoHoje !== b.cobradoHoje) return a.cobradoHoje ? 1 : -1;
      if (a.escalonado !== b.escalonado) return a.escalonado ? -1 : 1;
      if (b.itens.length !== a.itens.length) return b.itens.length - a.itens.length;
      return a.responsavel.localeCompare(b.responsavel, 'pt-BR');
    });
    return lista;
  }

  function primeiroNome(nome) {
    const partes = String(nome || '').trim().split(/\s+/);
    return partes[0] || '';
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '??';
    if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    return partes[0].slice(0, 2).toUpperCase();
  }

  function textoSituacao(item) {
    if (item.statusKey === 'ATRASADO') return 'Atrasado há ' + item.diasAtraso + (item.diasAtraso === 1 ? ' dia' : ' dias');
    if (item.statusKey === 'A_VENCER') {
      if (item.diasRestantes === 0) return 'Vence hoje';
      return 'Vence em ' + item.diasRestantes + (item.diasRestantes === 1 ? ' dia' : ' dias');
    }
    return item.statusLabel;
  }

  // Monta o e-mail de cobrança de um grupo: texto simples e versão formatada (com tabela).
  function montarEmail(grupo, cfgBruta, dataHoje) {
    const cfg = normalizeConfig(cfgBruta);
    const today = dataHoje || hoje();
    const feriados = parseFeriados(cfg.feriados).set;
    const limite = formatDate(addDiasUteis(today, cfg.diasResposta, feriados));
    const txtDias = cfg.diasResposta + (cfg.diasResposta === 1 ? ' dia útil' : ' dias úteis');
    const nome = grupo.itens[0].semResponsavel ? '' : primeiroNome(grupo.responsavel);
    const temCc = !!grupo.cc;

    let saudacao, intro, pedido, fecho;
    if (grupo.escalonado) {
      const motivos = ['atraso superior a ' + cfg.diasEscalonamento + ' dias'];
      if (cfg.escalonarRiscoAlto) motivos.push('classificação de Risco Alto');
      saudacao = nome ? 'Olá, ' + nome + ',' : 'Olá,';
      intro = ['Realizamos o monitoramento periódico dos planos de ação sob sua responsabilidade e identificamos pendências que requerem atenção prioritária e imediata, com plano(s) em ' + motivos.join(' e/ou ') + ':'];
      pedido = [];
      if (temCc) pedido.push('Diante da criticidade e do impacto aos controles internos da organização, incluímos a gestão imediata em cópia para acompanhamento.');
      pedido.push('Solicitamos impreterivelmente o envio da atualização do status e das respectivas evidências de implementação até o dia ' + limite + ' (prazo de ' + txtDias + ' a partir de hoje).');
      pedido.push('Caso haja algum impedimento formal ou necessidade de revisão de cronograma, pedimos que retorne este e-mail justificando a situação para alinhamento conjunto.');
      fecho = 'Aguardamos seu retorno tempestivo.';
    } else {
      saudacao = nome ? 'Olá, ' + nome + ', tudo bem?' : 'Olá, tudo bem?';
      intro = [
        'Escrevemos para realizar o acompanhamento periódico dos planos de ação sob sua responsabilidade junto à Auditoria Interna.',
        'Identificamos os seguintes itens que demandam sua atenção (atrasados ou com vencimento próximo):'
      ];
      pedido = [
        'Gostaríamos de solicitar a gentileza de nos enviar a atualização do status e as respectivas evidências de implementação até o dia ' + limite + ' (prazo de ' + txtDias + ' a partir de hoje).',
        'Caso o plano já tenha sido concluído, por favor responda a esta mensagem anexando a documentação comprobatória. Se precisar de esclarecimentos ou apoio no alinhamento de prazos, estamos à disposição.'
      ];
      fecho = 'Agradecemos desde já pela colaboração e parceria de sempre.';
    }

    // --- texto simples
    let planosTxt = '';
    grupo.itens.forEach(item => {
      const tipo = item.tipoPrazo ? ' (' + item.tipoPrazo + ')' : '';
      const risco = item.risco && item.risco !== 'Não informado' ? ' | Risco: ' + item.risco : '';
      planosTxt += '• [ID ' + item.customId + '] ' + item.plano + '\n';
      planosTxt += '   - Prazo: ' + formatDate(item.prazoEfetivo) + tipo + '\n';
      planosTxt += '   - Situação: ' + textoSituacao(item) + risco + '\n\n';
    });
    const text = [saudacao, '', intro.join('\n\n'), '', planosTxt + pedido.join('\n\n'), '', fecho, '', 'Atenciosamente,', cfg.assinatura].join('\n');

    // --- versão formatada (para colar no Outlook/Gmail com tabela)
    const f = 'font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937;';
    const td = 'border:1px solid #cbd5e1;padding:6px 10px;' + f;
    const th = td + 'background:#f1f5f9;font-weight:bold;text-align:left;';
    const p = t => '<p style="' + f + 'margin:0 0 12px 0;">' + escapeHtml(t) + '</p>';
    const linhas = grupo.itens.map(item => {
      const tipo = item.tipoPrazo === 'Reprogramado' ? ' (reprogramado)' : '';
      const cor = item.statusKey === 'ATRASADO' ? 'color:#b91c1c;font-weight:bold;' : '';
      return '<tr>' +
        '<td style="' + td + '">' + escapeHtml(item.customId) + '</td>' +
        '<td style="' + td + '">' + escapeHtml(item.plano) + '</td>' +
        '<td style="' + td + 'white-space:nowrap;">' + escapeHtml(formatDate(item.prazoEfetivo) + tipo) + '</td>' +
        '<td style="' + td + cor + '">' + escapeHtml(textoSituacao(item)) + '</td>' +
        '<td style="' + td + '">' + escapeHtml(item.risco === 'Não informado' ? '-' : item.risco) + '</td>' +
        '</tr>';
    }).join('');
    const tabela = '<table style="border-collapse:collapse;margin:0 0 14px 0;"><thead><tr>' +
      ['ID', 'Plano de ação', 'Prazo', 'Situação', 'Risco'].map(h => '<th style="' + th + '">' + h + '</th>').join('') +
      '</tr></thead><tbody>' + linhas + '</tbody></table>';
    const html = '<div style="' + f + '">' + p(saudacao) + intro.map(p).join('') + tabela + pedido.map(p).join('') + p(fecho) +
      '<p style="' + f + 'margin:0;">Atenciosamente,<br>' + escapeHtml(cfg.assinatura).replace(/\n/g, '<br>') + '</p></div>';

    return { to: grupo.email || '', cc: grupo.cc || '', subject: cfg.assunto, text, html, escalonado: grupo.escalonado, limite };
  }

  // Link mailto. Quando o texto não cabe com segurança, o link vai sem o corpo (curto = true)
  // e a tela copia o texto para o usuário colar.
  const LIMITE_MAILTO = 2000;
  function montarMailto(email, limite) {
    const max = limite || LIMITE_MAILTO;
    const enc = encodeURIComponent;
    const dest = separarEmails(email.to).map(e => enc(e).replace(/%40/g, '@')).join(';');
    const partes = ['subject=' + enc(email.subject)];
    const cc = separarEmails(email.cc).map(e => enc(e).replace(/%40/g, '@')).join(';');
    if (cc) partes.push('cc=' + cc);
    const base = 'mailto:' + dest + '?' + partes.join('&');
    const completo = base + '&body=' + enc(email.text.replace(/\n/g, '\r\n'));
    if (completo.length <= max) return { url: completo, curto: false };
    return { url: base, curto: true };
  }

  function textoCompleto(email) {
    const linhas = ['Para: ' + (email.to || '(sem e-mail na planilha)')];
    if (email.cc) linhas.push('Cc: ' + email.cc);
    linhas.push('Assunto: ' + email.subject, '', email.text);
    return linhas.join('\n');
  }

  // ------------------------------------------------------------------
  // Exportação
  // ------------------------------------------------------------------
  // Devolve cabeçalho e linhas. Datas saem como objetos Date (a tela grava como data de verdade no Excel).
  function montarExportacao(itens, colunas, mapa) {
    const originais = colunas.filter(c => !ehColunaCalculada(c));
    const colUltima = mapa.ultimaCobranca || COL_ULTIMA_COBRANCA;
    const colNum = mapa.numCobrancas || COL_NUM_COBRANCAS;
    const header = originais.slice();
    if (!header.includes(colUltima)) header.push(colUltima);
    if (!header.includes(colNum)) header.push(colNum);
    COLUNAS_CALCULADAS.forEach(c => header.push(c));

    const linhas = itens.map(item => header.map(col => {
      if (col === colUltima) return item.ultimaCobranca || '';
      if (col === colNum) return item.numCobrancas || 0;
      if (col === 'Status calculado') return item.statusLabel;
      if (col === 'Dias de atraso') return item.diasAtraso;
      if (col === 'Prazo vigente') return item.prazoEfetivo || '';
      if (col === 'Tipo de prazo') return item.tipoPrazo || '';
      const v = item.original[col];
      if (v instanceof Date) return parseDate(v) || '';
      return v === null || v === undefined ? '' : v;
    }));
    return { header, linhas };
  }

  const MODELO = {
    header: ['ID', 'Plano de Ação', 'Responsável', 'Email', 'Gestor', 'Email do Gestor', 'Área', 'Risco', 'Status', 'Prazo acordado', 'Prazo reprogramado', COL_ULTIMA_COBRANCA, COL_NUM_COBRANCAS, 'Observações'],
    instrucoes: [
      ['Como preencher o modelo'],
      [''],
      ['1. Use uma linha por plano de ação. O cabeçalho deve ficar na linha 1.'],
      ['2. Apague as linhas de exemplo (dados fictícios) antes de usar.'],
      ['3. Email: e-mail do responsável. Sem ele, a cobrança sai sem destinatário (o sistema não inventa endereços).'],
      ['4. Email do Gestor: usado em cópia somente nos e-mails escalonados.'],
      ['5. Risco: Alto, Médio ou Baixo.'],
      ['6. Status: escreva "Concluído" (ou "Implementado", "Encerrado") para planos finalizados e "Cancelado" para os cancelados. Qualquer outro texto é tratado como em aberto.'],
      ['7. Prazos: datas no formato dd/mm/aaaa. O prazo reprogramado, quando preenchido, vale no lugar do acordado.'],
      ['8. Última cobrança e Nº de cobranças: deixe em branco. O sistema preenche quando você marca uma cobrança e exporta a planilha.'],
      ['9. Você pode acrescentar outras colunas; elas aparecem na tela e são mantidas na exportação.']
    ]
  };

  return {
    normalizeKey, escapeHtml, hashTexto,
    parseDate, dataInvalida, formatDate, toIso, fromIso, diffDias, dateToSerial, hoje,
    parseFeriados, addDiasUteis,
    DEFAULT_CONFIG, normalizeConfig, listaPalavras, interpretarStatus, nivelRisco,
    COLUNAS_CALCULADAS, COL_ULTIMA_COBRANCA, COL_NUM_COBRANCAS, ehColunaCalculada, CAMPOS, detectarColunas,
    separarEmails, emailValido, listaEmailsValida,
    chavePlano, combinarCobrancas,
    processar, ordenarPadrao, ordenarPor,
    itemEscalonado, agruparCobrancas, primeiroNome, iniciais, textoSituacao,
    montarEmail, montarMailto, LIMITE_MAILTO, textoCompleto,
    montarExportacao, MODELO
  };
});
