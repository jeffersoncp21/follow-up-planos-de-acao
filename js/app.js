/*
 * Follow-up de Planos de Ação — tela.
 * As regras de negócio ficam em logica.js. Este arquivo só lê a planilha, desenha a tela e reage aos cliques.
 * Nenhum dado é enviado pela internet.
 */
(function () {
  'use strict';

  const F = window.FollowUp;
  const $ = id => document.getElementById(id);
  const esc = F.escapeHtml;
  const temXlsx = typeof XLSX !== 'undefined';

  // ------------------------------------------------------------------
  // Gravação local (somente configurações e registro de cobranças)
  // ------------------------------------------------------------------
  const LS_CFG = 'followup.config.v1';
  const LS_REG = 'followup.registro.v1';
  const store = {
    ok: (function () {
      try { localStorage.setItem('followup.teste', '1'); localStorage.removeItem('followup.teste'); return true; }
      catch (e) { return false; }
    })(),
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  };

  const state = {
    workbook: null,
    sheetName: '',
    fileName: '',
    rows: [],
    colunas: [],
    mapa: {},
    cfg: F.normalizeConfig(store.get(LS_CFG)),
    registro: store.get(LS_REG) || {},
    result: null,
    itens: [],
    today: F.hoje(),
    sortCol: null,
    sortDir: 'desc',
    filtros: { area: '', responsavel: '', risco: '', status: 'TODOS', busca: '' },
    exportadoAposMarcar: false
  };

  // ------------------------------------------------------------------
  // Cabeçalho e abas
  // ------------------------------------------------------------------
  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dataLonga(d) {
    return capitalizar(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }));
  }

  function atualizarCabecalho() {
    state.today = F.hoje();
    const cfg = state.cfg;
    $('todayIndicator').textContent = '📅 Hoje: ' + dataLonga(state.today);
    const feriados = F.parseFeriados(cfg.feriados).set;
    $('businessDaysBadge').textContent = dataLonga(F.addDiasUteis(state.today, cfg.diasResposta, feriados));
    $('businessDaysLabel').textContent = 'Prazo solicitado (' + cfg.diasResposta + (cfg.diasResposta === 1 ? ' dia útil' : ' dias úteis') + '):';
    $('optAVencer').textContent = cfg.janelaVencer === 0 ? 'Vence hoje' : 'Vence em até ' + cfg.janelaVencer + ' dias';
    $('cobrancasBannerSub').textContent = 'Agrupa planos atrasados e os que vencem em até ' + cfg.janelaVencer +
      (cfg.janelaVencer === 1 ? ' dia' : ' dias') + ', com um e-mail por responsável.';
  }

  function trocarAba(aba) {
    const geral = aba === 'geral';
    $('tabBtnGeral').classList.toggle('active', geral);
    $('tabBtnCobrancas').classList.toggle('active', !geral);
    $('tabContentGeral').style.display = geral ? 'flex' : 'none';
    $('tabContentCobrancas').style.display = geral ? 'none' : 'flex';
  }

  // ------------------------------------------------------------------
  // Leitura do Excel
  // ------------------------------------------------------------------
  function lerArquivo(file) {
    if (!temXlsx) { alert('O leitor de Excel não foi carregado. Confira se a pasta "vendor" está ao lado do index.html.'); return; }
    if (!/\.(xlsx|xls)$/i.test(file.name)) { alert('Selecione um arquivo Excel (.xlsx ou .xls).'); return; }

    const reader = new FileReader();
    reader.onerror = () => alert('Não foi possível ler o arquivo.');
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        if (!wb.SheetNames.length) { alert('O arquivo não tem nenhuma aba.'); return; }
        state.workbook = wb;
        state.fileName = file.name;
        // Escolhe a aba que mais se parece com uma lista de planos (mais colunas reconhecidas).
        // Em caso de empate, fica com a primeira. O usuário pode trocar na conferência.
        let melhor = null, melhorPontos = -1;
        wb.SheetNames.forEach(n => {
          const linhas = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
          if (!linhas.length) return;
          const mapa = F.detectarColunas(Object.keys(linhas[0]));
          const pontos = Object.keys(mapa).filter(k => mapa[k]).length;
          if (pontos > melhorPontos) { melhor = n; melhorPontos = pontos; }
        });
        if (!melhor) { alert('A planilha está vazia (nenhuma aba tem linhas abaixo do cabeçalho).'); return; }
        carregarAba(melhor);
      } catch (err) {
        console.error(err);
        alert('Erro ao ler o arquivo Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function carregarAba(nome) {
    const rows = XLSX.utils.sheet_to_json(state.workbook.Sheets[nome], { defval: '' });
    if (!rows.length) { alert('A aba "' + nome + '" não tem linhas abaixo do cabeçalho.'); return false; }
    state.sheetName = nome;
    carregarLinhas(rows, 'Arquivo: ' + state.fileName + (state.workbook.SheetNames.length > 1 ? ' • aba "' + nome + '"' : ''));
    return true;
  }

  function carregarLinhas(rows, rotulo) {
    // Colunas na ordem da planilha; colunas sem título e totalmente vazias são descartadas.
    const colunas = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!colunas.includes(k)) colunas.push(k); }));
    state.colunas = colunas.filter(c => !(/^__EMPTY/.test(c) && rows.every(r => r[c] === '' || r[c] === undefined)));
    state.rows = rows;
    state.mapa = F.detectarColunas(state.colunas);
    state.sortCol = null;
    state.filtros = { area: '', responsavel: '', risco: '', status: 'TODOS', busca: '' };
    $('searchInput').value = '';
    $('loadedFileName').textContent = rotulo;
    reprocessar();

    $('dashboardPanel').style.display = 'grid';
    $('filterPanel').style.display = 'block';
    $('tableResponsive').style.display = 'block';
    $('tableFooter').style.display = 'flex';
    $('emptyState').style.display = 'none';
    $('confPanel').style.display = 'block';
    // Abre a conferência sozinha quando há algo a revisar.
    $('confPanel').open = state.result.problemas.length > 0 || state.result.avisos.length > 0;
  }

  function reprocessar() {
    if (!state.rows.length) { atualizarCabecalho(); return; }
    atualizarCabecalho();
    state.result = F.processar(state.rows, state.colunas, state.mapa, state.cfg, state.today, state.registro);
    state.itens = state.result.itens;
    if (state.sortCol) F.ordenarPor(state.itens, state.sortCol, state.sortDir);
    else F.ordenarPadrao(state.itens);

    popularFiltros();
    renderConferencia();
    renderDashboard();
    renderCabecalhoTabela();
    renderTabela();
    renderCobrancas();
  }

  // ------------------------------------------------------------------
  // Conferência da importação
  // ------------------------------------------------------------------
  function renderConferencia() {
    const r = state.result;
    const pills = [];
    pills.push('<span class="conf-pill ok">' + state.itens.length + (state.itens.length === 1 ? ' plano lido' : ' planos lidos') + '</span>');
    if (r.avisos.length) pills.push('<span class="conf-pill warn">' + r.avisos.length + (r.avisos.length === 1 ? ' aviso de coluna' : ' avisos de coluna') + '</span>');
    if (r.problemas.length) pills.push('<span class="conf-pill danger">' + r.problemas.length + (r.problemas.length === 1 ? ' linha com problema' : ' problemas em linhas') + '</span>');
    if (!r.avisos.length && !r.problemas.length) pills.push('<span class="conf-pill ok">nada a revisar</span>');
    $('confPills').innerHTML = pills.join('');

    // Abas
    const abas = state.workbook ? state.workbook.SheetNames : [];
    $('confSheetBox').style.display = abas.length > 1 ? 'block' : 'none';
    if (abas.length > 1) {
      $('confSheetSelect').innerHTML = abas.map(a => '<option value="' + esc(a) + '"' + (a === state.sheetName ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
    }

    // Mapeamento de colunas
    const disponiveis = state.colunas.filter(c => !F.ehColunaCalculada(c));
    $('confMap').innerHTML = F.CAMPOS.map(campo => {
      const atual = state.mapa[campo.key] || '';
      const opts = ['<option value="">— não há —</option>'].concat(
        disponiveis.map(c => '<option value="' + esc(c) + '"' + (c === atual ? ' selected' : '') + '>' + esc(c) + '</option>')
      ).join('');
      const falta = !atual && campo.importante;
      return '<label for="map_' + campo.key + '">' + esc(campo.label) + '</label>' +
        '<select id="map_' + campo.key + '" data-campo="' + campo.key + '"' + (falta ? ' class="faltando"' : '') + '>' + opts + '</select>';
    }).join('');

    $('confAvisos').innerHTML = r.avisos.length
      ? r.avisos.map(a => '<li class="warn">' + esc(a) + '</li>').join('')
      : '<li>Todas as colunas importantes foram encontradas.</li>';

    const rotulos = { CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado', ABERTO: 'Em aberto' };
    $('confStatusBody').innerHTML = r.statusResumo.map(s =>
      '<tr><td>' + esc(s.valor) + '</td><td>' + s.qtd + '</td><td><strong>' + rotulos[s.interpretacao] + '</strong></td></tr>'
    ).join('');

    $('confProbCount').textContent = r.problemas.length ? '(' + r.problemas.length + ')' : '';
    $('confProblemas').innerHTML = r.problemas.length
      ? r.problemas.map(p => '<li class="' + (p.tipo === 'prazo' ? 'danger' : 'warn') + '"><strong>Linha ' + p.linha + ' (ID ' + esc(p.id) + '):</strong> ' + esc(p.msg) + '</li>').join('')
      : '<li>Nenhuma linha com problema.</li>';
  }

  // ------------------------------------------------------------------
  // Filtros, indicadores e gráfico
  // ------------------------------------------------------------------
  function preencherSelect(sel, rotuloTodos, valores, atual) {
    sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('', rotuloTodos);
    valores.forEach(v => add(v, v));
    sel.value = valores.includes(atual) ? atual : '';
    return sel.value;
  }

  function popularFiltros() {
    const ord = (a, b) => a.localeCompare(b, 'pt-BR');
    const f = state.filtros;
    f.area = preencherSelect($('filterArea'), 'Todas as Áreas', [...new Set(state.itens.map(d => d.area))].sort(ord), f.area);
    f.responsavel = preencherSelect($('filterResponsavel'), 'Todos os Responsáveis', [...new Set(state.itens.map(d => d.responsavel))].sort(ord), f.responsavel);
    const pesoRisco = { alto: 0, medio: 1, baixo: 2, '': 3 };
    const riscos = [...new Set(state.itens.map(d => d.risco))].sort((a, b) => pesoRisco[F.nivelRisco(a)] - pesoRisco[F.nivelRisco(b)] || ord(a, b));
    f.risco = preencherSelect($('filterRisco'), 'Todos os Riscos', riscos, f.risco);
    $('filterStatus').value = f.status;
  }

  function renderDashboard() {
    const itens = state.itens;
    const total = itens.length;
    const atrasados = itens.filter(d => d.statusKey === 'ATRASADO');
    const n = k => itens.filter(d => d.statusKey === k).length;

    $('kpiTotal').textContent = total;
    const partes = [];
    if (n('CONCLUIDO')) partes.push(n('CONCLUIDO') + ' concluído(s)');
    if (n('CANCELADO')) partes.push(n('CANCELADO') + ' cancelado(s)');
    if (n('SEM_PRAZO')) partes.push(n('SEM_PRAZO') + ' sem prazo');
    $('kpiTotalSub').textContent = partes.length ? partes.join(' • ') : 'Total cadastrado na planilha';
    $('kpiLate').textContent = atrasados.length;
    $('kpiLatePct').textContent = (total > 0 ? ((atrasados.length / total) * 100).toFixed(1).replace('.', ',') : '0') + '%';
    const media = atrasados.length ? (atrasados.reduce((a, c) => a + c.diasAtraso, 0) / atrasados.length).toFixed(1).replace('.', ',') : '0';
    $('kpiAvgLate').innerHTML = esc(media) + ' <small style="font-size: 1rem; font-weight: 500;">dias</small>';

    const container = $('chartBarsContainer');
    container.innerHTML = '';
    $('chartTotalBadge').textContent = atrasados.length + (atrasados.length === 1 ? ' atrasado' : ' atrasados');
    if (!atrasados.length) {
      container.innerHTML = '<div class="chart-empty">Não há planos atrasados no momento.</div>';
      return;
    }
    const porArea = {};
    atrasados.forEach(i => { porArea[i.area] = (porArea[i.area] || 0) + 1; });
    const areas = Object.keys(porArea).map(a => ({ area: a, count: porArea[a] })).sort((a, b) => b.count - a.count);
    const max = areas[0].count;
    areas.forEach(item => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.title = 'Clique para filtrar pela área: ' + item.area;
      row.innerHTML =
        '<span class="bar-label" title="' + esc(item.area) + '">' + esc(item.area) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width: ' + Math.max(12, Math.round((item.count / max) * 100)) + '%;"></div></div>' +
        '<span class="bar-value">' + item.count + (item.count === 1 ? ' plano' : ' planos') + '</span>';
      row.addEventListener('click', () => {
        state.filtros.area = item.area;
        $('filterArea').value = item.area;
        renderTabela();
      });
      container.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // Tabela
  // ------------------------------------------------------------------
  function colunasOriginaisVisiveis() {
    const ocultas = [state.mapa.ultimaCobranca, state.mapa.numCobrancas].filter(Boolean);
    return state.colunas.filter(c => !F.ehColunaCalculada(c) && !ocultas.includes(c));
  }

  const COLS_CALC = [
    { label: '#', key: 'seq' },
    { label: 'Status Calculado', key: 'statusLabel' },
    { label: 'Dias de Atraso ⏱️', key: 'diasAtraso' },
    { label: 'Prazo Vigente', key: 'prazoEfetivo' },
    { label: 'Última Cobrança', key: 'ultimaCobranca' },
    { label: 'Nº Cobr.', key: 'numCobrancas' }
  ];

  function renderCabecalhoTabela() {
    const tr = $('tableHeaderRow');
    tr.innerHTML = '';
    const addTh = (label, key, calc) => {
      const th = document.createElement('th');
      th.textContent = label + (state.sortCol === key ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '');
      th.title = 'Clique para ordenar';
      if (calc) { th.style.backgroundColor = '#f1f5f9'; th.style.fontWeight = '700'; }
      th.addEventListener('click', () => ordenarColuna(key));
      tr.appendChild(th);
    };
    COLS_CALC.forEach(c => addTh(c.label, c.key, true));
    colunasOriginaisVisiveis().forEach(c => addTh(c, 'orig_' + c, false));
  }

  function ordenarColuna(key) {
    if (state.sortCol === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = key; state.sortDir = (key === 'diasAtraso' || key === 'numCobrancas') ? 'desc' : 'asc'; }
    F.ordenarPor(state.itens, state.sortCol, state.sortDir);
    renderCabecalhoTabela();
    renderTabela();
  }

  function textoCelula(v) {
    if (v instanceof Date) return F.formatDate(F.parseDate(v));
    return v === null || v === undefined ? '' : String(v);
  }

  function filtrados() {
    const f = state.filtros;
    return state.itens.filter(item => {
      if (f.status !== 'TODOS' && item.statusKey !== f.status) return false;
      if (f.area && item.area !== f.area) return false;
      if (f.responsavel && item.responsavel !== f.responsavel) return false;
      if (f.risco && item.risco !== f.risco) return false;
      if (f.busca) {
        const alvo = [item.statusLabel, item.area, item.responsavel, item.risco, item.customId, F.formatDate(item.prazoEfetivo)]
          .concat(Object.values(item.original).map(textoCelula)).join(' \n ').toLowerCase();
        if (!alvo.includes(f.busca)) return false;
      }
      return true;
    });
  }

  function temFiltro() {
    const f = state.filtros;
    return !!(f.area || f.responsavel || f.risco || f.busca || f.status !== 'TODOS');
  }

  function criarBadge(classe, texto) {
    const b = document.createElement('span');
    b.className = classe;
    b.textContent = texto;
    return b;
  }

  function renderTabela() {
    const tbody = $('tableBody');
    tbody.innerHTML = '';
    const lista = filtrados();
    const colsOrig = colunasOriginaisVisiveis();

    $('footerCount').textContent = 'Exibindo ' + lista.length + ' de ' + state.itens.length + ' planos';
    const filtrando = temFiltro() && lista.length > 0 && lista.length < state.itens.length;
    $('btnExportFiltrado').style.display = filtrando ? 'inline-flex' : 'none';
    $('btnExportFiltrado').textContent = '📥 Exportar só o filtro (' + lista.length + ')';
    $('btnExportExcel').textContent = '📥 Exportar planilha completa (' + state.itens.length + ')';

    if (!lista.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = colsOrig.length + COLS_CALC.length;
      td.style.textAlign = 'center';
      td.style.padding = '36px';
      td.style.color = '#94a3b8';
      td.textContent = 'Nenhum plano corresponde aos filtros aplicados.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const icones = { CONCLUIDO: '✓ ', ATRASADO: '⚠️ ', A_VENCER: '⏳ ', NO_PRAZO: '⏱️ ', SEM_PRAZO: '❓ ', CANCELADO: '' };
    const classes = { CONCLUIDO: 'badge-concluido', ATRASADO: 'badge-atrasado', A_VENCER: 'badge-vence-7', NO_PRAZO: 'badge-no-prazo', SEM_PRAZO: 'badge-sem-prazo', CANCELADO: 'badge-cancelado' };

    lista.forEach(item => {
      const tr = document.createElement('tr');
      const critico = item.statusKey === 'ATRASADO' && item.isRiscoAlto;
      if (critico) tr.classList.add('danger-high-risk');
      const td = () => { const c = document.createElement('td'); tr.appendChild(c); return c; };

      const tdSeq = td();
      tdSeq.textContent = item.seq;
      tdSeq.style.fontWeight = '700';

      td().appendChild(criarBadge('badge ' + classes[item.statusKey], (critico ? '🚨 ' : icones[item.statusKey]) + item.statusLabel));

      const delay = criarBadge('badge-delay ' + (item.diasAtraso > 0 ? 'late' : 'none'),
        item.diasAtraso > 0 ? item.diasAtraso + (item.diasAtraso === 1 ? ' dia' : ' dias') : '-');
      if (critico) { delay.style.backgroundColor = '#dc2626'; delay.style.color = '#ffffff'; }
      td().appendChild(delay);

      const tdPrazo = td();
      if (item.prazoEfetivo) {
        const s = document.createElement('strong');
        s.textContent = F.formatDate(item.prazoEfetivo);
        tdPrazo.appendChild(s);
        if (item.tipoPrazo === 'Reprogramado') {
          const tag = criarBadge('prazo-tag', 'Reprog.');
          tag.title = 'Usando prazo reprogramado';
          tdPrazo.appendChild(tag);
        }
      } else tdPrazo.textContent = '-';

      const tdUlt = td();
      tdUlt.textContent = item.ultimaCobranca ? F.formatDate(item.ultimaCobranca) : '-';
      if (item.cobradoHoje) tdUlt.appendChild(criarBadge('prazo-tag', 'hoje'));
      td().textContent = item.numCobrancas || '-';

      colsOrig.forEach(col => {
        const c = td();
        const val = item.original[col];
        if (col === state.mapa.risco && String(val).trim() !== '') {
          const nivel = F.nivelRisco(val);
          c.appendChild(criarBadge('badge-risk badge-risk-' + (nivel || 'baixo'), (nivel === 'alto' ? '🔥 ' : '') + val));
        } else {
          const t = textoCelula(val);
          c.textContent = t !== '' ? t : '-';
        }
      });

      tbody.appendChild(tr);
    });
  }

  // ------------------------------------------------------------------
  // Excel: exportação e modelo
  // ------------------------------------------------------------------
  // Monta uma aba em que as datas são datas de verdade no Excel (não texto).
  function criarAba(header, linhas) {
    const datas = [];
    const aoa = [header].concat(linhas.map((l, r) => l.map((v, c) => {
      if (v instanceof Date) { datas.push([r + 1, c]); return F.dateToSerial(v); }
      return v;
    })));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    datas.forEach(([r, c]) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) { cell.t = 'n'; cell.z = 'dd/mm/yyyy'; }
    });
    ws['!cols'] = header.map((h, c) => {
      const maior = aoa.reduce((m, l) => Math.max(m, String(l[c] === undefined ? '' : l[c]).length), String(h).length);
      return { wch: Math.min(60, Math.max(10, maior + 2)) };
    });
    return ws;
  }

  function exportar(apenasFiltro) {
    if (!temXlsx) { alert('O leitor de Excel não foi carregado; não é possível exportar.'); return; }
    if (!state.itens.length) { alert('Nenhum dado para exportar.'); return; }
    const itens = (apenasFiltro ? filtrados() : state.itens.slice()).sort((a, b) => apenasFiltro ? 0 : a.seq - b.seq);
    const exp = F.montarExportacao(itens, state.colunas, state.mapa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, criarAba(exp.header, exp.linhas), 'Follow-up');

    const cfg = state.cfg;
    const params = [
      ['Parâmetro', 'Valor'],
      ['Data-base do cálculo', state.today],
      ['Planos nesta planilha', itens.length],
      ['Total de planos carregados', state.itens.length],
      ['Exportação', apenasFiltro ? 'Somente os planos filtrados na tela' : 'Planilha completa'],
      ['"A vencer" = próximos (dias)', cfg.janelaVencer],
      ['Escalonar acima de (dias de atraso)', cfg.diasEscalonamento],
      ['Escalonar Risco Alto em atraso', cfg.escalonarRiscoAlto ? 'Sim' : 'Não'],
      ['Dias úteis para resposta', cfg.diasResposta]
    ];
    XLSX.utils.book_append_sheet(wb, criarAba(params[0], params.slice(1)), 'Parâmetros');

    XLSX.writeFile(wb, 'follow_up_' + F.toIso(state.today) + (apenasFiltro ? '_filtro' : '') + '.xlsx');
    if (!apenasFiltro) { state.exportadoAposMarcar = true; renderBannerNaoGravadas(); }
  }

  function baixarModelo() {
    if (!temXlsx) { alert('O leitor de Excel não foi carregado; não é possível gerar o modelo.'); return; }
    const t = state.today;
    const dia = n => { const d = new Date(t); d.setDate(d.getDate() + n); return d; };
    const linhas = [
      ['EX-01', 'Exemplo (apague esta linha): revisar conciliação bancária', 'Fulano de Exemplo', 'fulano@exemplo.com.br', 'Beltrana de Exemplo', 'beltrana@exemplo.com.br', 'Financeiro', 'Alto', 'Em andamento', dia(-10), '', '', '', 'Linha fictícia'],
      ['EX-02', 'Exemplo (apague esta linha): atualizar política de compras', 'Sicrano de Exemplo', 'sicrano@exemplo.com.br', 'Beltrana de Exemplo', 'beltrana@exemplo.com.br', 'Suprimentos', 'Médio', 'Não iniciado', dia(20), '', '', '', 'Linha fictícia']
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, criarAba(F.MODELO.header, linhas), 'Planos de ação');
    const wsInstr = XLSX.utils.aoa_to_sheet(F.MODELO.instrucoes);
    wsInstr['!cols'] = [{ wch: 130 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');
    XLSX.writeFile(wb, 'modelo_planos_de_acao.xlsx');
  }

  // ------------------------------------------------------------------
  // Área de transferência
  // ------------------------------------------------------------------
  function copiarLegado(texto, html) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.left = '-9999px';
    div.style.whiteSpace = 'pre-wrap';
    if (html) div.innerHTML = html; else div.textContent = texto;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    document.body.removeChild(div);
    return ok;
  }

  function copiar(texto, html) {
    const moderno = () => {
      if (!navigator.clipboard) return Promise.reject(new Error('sem clipboard'));
      if (html && window.ClipboardItem && navigator.clipboard.write) {
        return navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texto], { type: 'text/plain' })
        })]);
      }
      return navigator.clipboard.writeText(texto);
    };
    return moderno().catch(() => {
      if (copiarLegado(texto, html)) return;
      throw new Error('O navegador bloqueou a cópia. Selecione o texto e use Ctrl+C.');
    });
  }

  // ------------------------------------------------------------------
  // Cobranças
  // ------------------------------------------------------------------
  function salvarRegistro() {
    if (!store.set(LS_REG, state.registro) && store.ok) alert('Não foi possível gravar o registro neste navegador.');
  }

  function marcarCobrado(grupo) {
    const iso = F.toIso(state.today);
    grupo.itens.forEach(item => {
      if (item.cobradoHoje) return;
      const lista = state.registro[item.key] || (state.registro[item.key] = []);
      if (!lista.includes(iso)) lista.push(iso);
    });
    salvarRegistro();
    state.exportadoAposMarcar = false;
    reprocessar();
  }

  function desfazerCobranca(grupo) {
    const iso = F.toIso(state.today);
    grupo.itens.forEach(item => {
      const lista = state.registro[item.key];
      if (!lista) return;
      const novo = lista.filter(d => d !== iso);
      if (novo.length) state.registro[item.key] = novo; else delete state.registro[item.key];
    });
    salvarRegistro();
    reprocessar();
  }

  function temMarcacaoLocalHoje(grupo) {
    const iso = F.toIso(state.today);
    return grupo.itens.some(i => (state.registro[i.key] || []).includes(iso));
  }

  function renderBannerNaoGravadas() {
    const n = state.itens.filter(i => i.cobrancasNaoGravadas > 0).length;
    const mostrar = n > 0 && !state.exportadoAposMarcar;
    $('naoGravadasBanner').style.display = mostrar ? 'flex' : 'none';
    if (mostrar) {
      $('naoGravadasTexto').innerHTML = '<strong>' + n + (n === 1 ? ' plano tem' : ' planos têm') +
        ' cobrança registrada só neste navegador.</strong> Exporte a planilha completa e use o arquivo exportado como base na próxima rodada, para o registro ficar guardado na planilha.' +
        (store.ok ? '' : ' <strong>Atenção: este navegador não permite gravação local; o registro se perde ao fechar a página.</strong>');
    }
  }

  function renderCobrancas() {
    const container = $('cobrancasCardsContainer');
    container.innerHTML = '';
    const grupos = F.agruparCobrancas(state.itens, state.cfg);
    const pendentes = grupos.filter(g => !g.cobradoHoje).length;

    renderBannerNaoGravadas();

    if (!grupos.length) {
      $('cobrancasCountBadge').style.display = 'none';
      $('cobrancasEmptyState').style.display = 'block';
      $('cobrancasEmptyTitle').textContent = 'Nenhuma cobrança necessária';
      $('cobrancasEmptyText').textContent = 'Não há planos atrasados nem com vencimento nos próximos ' + state.cfg.janelaVencer + ' dias.';
      return;
    }
    $('cobrancasEmptyState').style.display = 'none';
    $('cobrancasCountBadge').textContent = pendentes;
    $('cobrancasCountBadge').style.display = pendentes > 0 ? 'inline-block' : 'none';
    grupos.forEach((g, i) => container.appendChild(criarCard(g, i + 1)));
  }

  function criarCard(grupo, idx) {
    const email = F.montarEmail(grupo, state.cfg, state.today);
    const mailto = F.montarMailto(email);
    const card = document.createElement('div');
    card.className = 'email-card' + (grupo.escalonado ? ' escalonado' : '') + (grupo.cobradoHoje ? ' cobrado' : '');

    const linhasPlanos = grupo.itens.map(item => {
      const situacao = item.statusKey === 'ATRASADO'
        ? '<span class="badge badge-atrasado" style="font-size: 0.7rem;">⚠️ Atrasado (' + item.diasAtraso + 'd)</span>'
        : '<span class="badge badge-vence-7" style="font-size: 0.7rem;">⏳ ' + esc(F.textoSituacao(item)) + '</span>';
      const risco = '<span class="badge-risk badge-risk-' + (item.riscoNivel || 'baixo') + '" style="font-size: 0.65rem;">' +
        (item.isRiscoAlto ? '🔥 ' : '') + esc(item.risco) + '</span>';
      const cobr = item.numCobrancas
        ? item.numCobrancas + '× • última ' + esc(F.formatDate(item.ultimaCobranca))
        : 'nunca cobrado';
      return '<tr><td><strong>#' + esc(item.customId) + '</strong></td><td>' + esc(item.plano) + '</td><td>' +
        esc(F.formatDate(item.prazoEfetivo)) + '</td><td>' + situacao + '</td><td>' + risco + '</td><td>' + cobr + '</td></tr>';
    }).join('');

    const tags = [];
    if (grupo.cobradoHoje) tags.push('<span class="cobrado-tag">✓ Cobrado hoje</span>');
    else if (grupo.ultimaCobranca) {
      const dias = F.diffDias(state.today, grupo.ultimaCobranca);
      tags.push('<span class="historico-tag">Última cobrança: ' + esc(F.formatDate(grupo.ultimaCobranca)) + ' (há ' + dias + (dias === 1 ? ' dia' : ' dias') + ')</span>');
    }
    tags.push(grupo.escalonado
      ? '<span class="escalonado-tag">🚨 Escalonado' + (email.cc ? ' (gestor em cópia)' : '') + '</span>'
      : '<span class="cordial-tag">🤝 Tom cordial</span>');

    const para = email.to
      ? esc(email.to) + '<button class="mini-copy" type="button" data-copy="to">copiar</button>'
      : '<span class="meta-warn">⚠ Sem e-mail na planilha. Preencha a coluna de e-mail do responsável ou digite o destinatário no programa de e-mail.</span>';
    let cc = '';
    if (grupo.escalonado) {
      const nomes = grupo.gestores.length ? ' Gestor informado: ' + esc(grupo.gestores.join(', ')) + '.' : '';
      cc = '<span class="email-meta-label">Cc (gestor):</span><span class="email-meta-value">' + (email.cc
        ? '<span style="color: #b91c1c; font-weight: 600;">' + esc(email.cc) + '</span><button class="mini-copy" type="button" data-copy="cc">copiar</button>'
        : '<span class="meta-warn">⚠ Sem e-mail do gestor na planilha.' + nomes + ' Inclua a cópia manualmente.</span>') + '</span>';
    }

    card.innerHTML =
      '<div class="email-card-header">' +
        '<div class="person-info">' +
          '<div class="person-avatar">' + esc(F.iniciais(grupo.responsavel)) + '</div>' +
          '<div class="person-details"><h3>' + esc(grupo.responsavel) + '</h3>' +
          '<p>Área: <strong>' + esc(grupo.areas.join(', ')) + '</strong> • ' + grupo.itens.length + (grupo.itens.length === 1 ? ' plano pendente' : ' planos pendentes') + '</p></div>' +
        '</div>' +
        '<div class="card-tags" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">' + tags.join('') + '</div>' +
      '</div>' +
      '<div class="email-card-body">' +
        '<div class="email-meta-grid">' +
          '<span class="email-meta-label">Para:</span><span class="email-meta-value">' + para + '</span>' + cc +
          '<span class="email-meta-label">Assunto:</span><span class="email-meta-value"><strong>' + esc(email.subject) + '</strong><button class="mini-copy" type="button" data-copy="subject">copiar</button></span>' +
        '</div>' +
        '<div>' +
          '<div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Planos incluídos nesta cobrança:</div>' +
          '<div style="overflow-x: auto; background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px;">' +
            '<table class="plans-mini-table"><thead><tr><th>ID</th><th>Plano de Ação</th><th>Prazo</th><th>Situação</th><th>Risco</th><th>Cobranças</th></tr></thead>' +
            '<tbody>' + linhasPlanos + '</tbody></table>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Corpo do e-mail:</div>' +
          '<div class="email-preview-box">' + esc(email.text) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="email-card-footer">' +
        '<div class="footer-left">' +
          (grupo.cobradoHoje
            ? (temMarcacaoLocalHoje(grupo) ? '<button class="btn btn-outline" type="button" data-acao="desfazer">↩ Desfazer marcação de hoje</button>' : '')
            : '<button class="btn btn-success" type="button" data-acao="marcar" title="Registra a data de hoje como cobrança de todos os planos deste cartão">✓ Marcar como cobrado hoje</button>') +
          '<span class="toast-msg" data-toast></span>' +
        '</div>' +
        '<div class="footer-right">' +
          '<button class="btn btn-outline" type="button" data-acao="copiar-texto" title="Copia destinatário, assunto e mensagem em texto simples">📄 Copiar tudo (texto)</button>' +
          '<button class="btn btn-outline" type="button" data-acao="copiar-formatado" title="Copia a mensagem com a tabela de planos, pronta para colar no e-mail">📋 Copiar e-mail formatado</button>' +
          '<a class="btn btn-primary" data-acao="abrir" href="' + esc(mailto.url) + '">✉️ Abrir no programa de e-mail</a>' +
        '</div>' +
      '</div>';

    const toast = card.querySelector('[data-toast]');
    const avisar = (msg, erro) => {
      toast.textContent = msg;
      toast.style.color = erro ? '#b91c1c' : '';
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('show'), erro ? 7000 : 3500);
    };
    const tentarCopiar = (texto, html, msg) => copiar(texto, html).then(() => avisar(msg)).catch(e => avisar(e.message, true));

    card.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
      const campo = btn.getAttribute('data-copy');
      tentarCopiar(email[campo], null, 'Copiado ✓');
    }));
    card.querySelector('[data-acao="copiar-texto"]').addEventListener('click', () => tentarCopiar(F.textoCompleto(email), null, 'Texto copiado ✓'));
    card.querySelector('[data-acao="copiar-formatado"]').addEventListener('click', () => tentarCopiar(email.text, email.html, 'E-mail copiado com tabela. Cole com Ctrl+V ✓'));
    card.querySelector('[data-acao="abrir"]').addEventListener('click', () => {
      if (mailto.curto) {
        // Mensagem longa demais para o link: abre só com destinatário e assunto e deixa o texto copiado.
        tentarCopiar(email.text, email.html, 'Mensagem longa: o texto foi copiado. Cole no corpo do e-mail com Ctrl+V ✓');
      }
    });
    const btnMarcar = card.querySelector('[data-acao="marcar"]');
    if (btnMarcar) btnMarcar.addEventListener('click', () => marcarCobrado(grupo));
    const btnDesfazer = card.querySelector('[data-acao="desfazer"]');
    if (btnDesfazer) btnDesfazer.addEventListener('click', () => desfazerCobranca(grupo));

    return card;
  }

  // ------------------------------------------------------------------
  // Configurações
  // ------------------------------------------------------------------
  function preencherConfig(cfg) {
    $('cfgAssunto').value = cfg.assunto;
    $('cfgAssinatura').value = cfg.assinatura;
    $('cfgDiasResposta').value = cfg.diasResposta;
    $('cfgJanela').value = cfg.janelaVencer;
    $('cfgEscalonamento').value = cfg.diasEscalonamento;
    $('cfgRiscoAlto').checked = cfg.escalonarRiscoAlto;
    $('cfgFeriados').value = cfg.feriados;
    $('cfgConcluido').value = cfg.palavrasConcluido;
    $('cfgCancelado').value = cfg.palavrasCancelado;
  }

  function abrirConfig() {
    preencherConfig(state.cfg);
    const n = Object.keys(state.registro).length;
    $('cfgStorageInfo').textContent = store.ok
      ? ' Hoje há registro de cobrança de ' + n + (n === 1 ? ' plano.' : ' planos.')
      : ' Este navegador não permite gravação local: configurações e registro valem só até fechar a página.';
    $('configDialog').showModal();
  }

  function salvarConfig() {
    const nova = F.normalizeConfig({
      assunto: $('cfgAssunto').value,
      assinatura: $('cfgAssinatura').value,
      diasResposta: $('cfgDiasResposta').value,
      janelaVencer: $('cfgJanela').value,
      diasEscalonamento: $('cfgEscalonamento').value,
      escalonarRiscoAlto: $('cfgRiscoAlto').checked,
      feriados: $('cfgFeriados').value,
      palavrasConcluido: $('cfgConcluido').value,
      palavrasCancelado: $('cfgCancelado').value
    });
    const inval = F.parseFeriados(nova.feriados).invalidos;
    if (inval.length) {
      alert('Estas linhas de feriado não são datas válidas e serão ignoradas:\n\n' + inval.join('\n') + '\n\nUse o formato dd/mm/aaaa.');
    }
    state.cfg = nova;
    store.set(LS_CFG, nova);
    $('configDialog').close();
    reprocessar();
  }

  // ------------------------------------------------------------------
  // Dados de exemplo (fictícios)
  // ------------------------------------------------------------------
  function carregarExemplo() {
    const t = F.hoje();
    const dia = n => { const d = new Date(t); d.setDate(d.getDate() + n); return F.formatDate(d); };
    const linha = (id, plano, resp, email, gestor, gestorEmail, area, risco, status, acordado, reprog, obs) => ({
      'ID': id, 'Plano de Ação': plano, 'Responsável': resp, 'Email': email, 'Gestor': gestor, 'Email do Gestor': gestorEmail,
      'Área': area, 'Risco': risco, 'Status': status, 'Prazo acordado': acordado, 'Prazo reprogramado': reprog, 'Observações': obs
    });
    const dir = ['Marcelo Diretor', 'marcelo.diretoria@exemplo.com.br'];
    const cio = ['Fernando Tecnologia', 'fernando.ti@exemplo.com.br'];
    const rh = ['Patrícia Pessoas', 'patricia.rh@exemplo.com.br'];
    const demo = [
      linha(1, 'Revisar conciliação bancária e tesouraria', 'Carlos Eduardo', 'carlos.eduardo@exemplo.com.br', dir[0], dir[1], 'Financeiro', 'Alto', 'Em andamento', dia(-75), '', 'Atraso longo e risco alto (escalonado)'),
      linha(2, 'Implantar aprovação digital de compras', 'Juliana Santos', 'juliana.santos@exemplo.com.br', cio[0], cio[1], 'TI', 'Alto', 'Em andamento', dia(-30), dia(-14), 'Risco alto atrasado (escalonado)'),
      linha(3, 'Adequar contingência do datacenter', 'Juliana Santos', 'juliana.santos@exemplo.com.br', cio[0], cio[1], 'TI', 'Alto', 'Em andamento', dia(-10), '', 'Infraestrutura crítica atrasada'),
      linha(4, 'Recálculo das provisões trabalhistas', 'Ricardo Mendes', 'ricardo.mendes@exemplo.com.br', dir[0], dir[1], 'Controladoria', 'Médio', 'Em andamento', dia(-6), '', 'Atrasado de risco médio (cordial)'),
      linha(5, 'Atualizar catálogo de materiais de consumo', 'Ana Beatriz', 'ana.beatriz@exemplo.com.br', rh[0], rh[1], 'Suprimentos', 'Baixo', 'Não iniciado', dia(-3), '', 'Atrasado de risco baixo (cordial)'),
      linha(6, 'Treinamento obrigatório da equipe de compras', 'Ana Beatriz', 'ana.beatriz@exemplo.com.br', rh[0], rh[1], 'Suprimentos', 'Médio', 'Não iniciado', dia(5), '', 'Vence em 5 dias'),
      linha(7, 'Revisão de acessos privilegiados ao ERP', 'Marcos Ribeiro', 'marcos.ribeiro@exemplo.com.br', cio[0], cio[1], 'Segurança', 'Alto', 'Em andamento', dia(3), '', 'Vence em 3 dias'),
      linha(8, 'Inventário físico semestral do almoxarifado', 'Roberto Alves', 'roberto.alves@exemplo.com.br', dir[0], dir[1], 'Logística', 'Médio', 'Em andamento', dia(22), '', 'No prazo (sem cobrança)'),
      linha(9, 'Renegociação de contratos de telefonia', 'Fernanda Lima', 'fernanda.lima@exemplo.com.br', rh[0], rh[1], 'Facilities', 'Baixo', 'Concluído', dia(-15), '', 'Concluído (sem cobrança)'),
      linha(10, 'Formalizar política de viagens', 'Roberto Alves', 'roberto.alves@exemplo.com.br', dir[0], dir[1], 'Logística', 'Baixo', 'Implementado', dia(-40), '', 'Status "Implementado" conta como concluído')
    ];
    state.workbook = null;
    state.fileName = '';
    carregarLinhas(demo, 'Dados de exemplo (fictícios)');
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function iniciar() {
    if (!temXlsx) $('libWarning').style.display = 'flex';
    atualizarCabecalho();

    $('tabBtnGeral').addEventListener('click', () => trocarAba('geral'));
    $('tabBtnCobrancas').addEventListener('click', () => trocarAba('cobrancas'));

    const dropZone = $('dropZone');
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', e => { const f = e.dataTransfer.files; if (f && f.length) lerArquivo(f[0]); });
    $('fileInput').addEventListener('change', e => {
      if (e.target.files && e.target.files.length) lerArquivo(e.target.files[0]);
      e.target.value = ''; // permite recarregar o mesmo arquivo
    });

    $('btnSampleData').addEventListener('click', carregarExemplo);
    $('btnModelo').addEventListener('click', baixarModelo);
    $('btnConfig').addEventListener('click', abrirConfig);

    const filtro = (id, campo, evento) => $(id).addEventListener(evento, e => {
      state.filtros[campo] = campo === 'busca' ? e.target.value.toLowerCase().trim() : e.target.value;
      renderTabela();
    });
    filtro('filterArea', 'area', 'change');
    filtro('filterResponsavel', 'responsavel', 'change');
    filtro('filterRisco', 'risco', 'change');
    filtro('filterStatus', 'status', 'change');
    filtro('searchInput', 'busca', 'input');

    $('btnResetFilters').addEventListener('click', () => {
      state.filtros = { area: '', responsavel: '', risco: '', status: 'TODOS', busca: '' };
      $('searchInput').value = '';
      popularFiltros();
      renderTabela();
    });
    $('btnDefaultSort').addEventListener('click', () => {
      state.sortCol = null;
      F.ordenarPadrao(state.itens);
      renderCabecalhoTabela();
      renderTabela();
    });

    $('btnExportExcel').addEventListener('click', () => exportar(false));
    $('btnExportFiltrado').addEventListener('click', () => exportar(true));
    $('btnExportFromBanner').addEventListener('click', () => exportar(false));
    $('btnPrint').addEventListener('click', () => window.print());

    // Conferência: troca de aba e de coluna
    $('confSheetSelect').addEventListener('change', e => { if (!carregarAba(e.target.value)) e.target.value = state.sheetName; });
    $('confMap').addEventListener('change', e => {
      const campo = e.target.getAttribute('data-campo');
      if (!campo) return;
      const valor = e.target.value;
      // Uma coluna só pode ocupar um campo.
      if (valor) Object.keys(state.mapa).forEach(k => { if (state.mapa[k] === valor) state.mapa[k] = ''; });
      state.mapa[campo] = valor;
      reprocessar();
    });

    // Configurações
    $('configForm').addEventListener('submit', e => { e.preventDefault(); salvarConfig(); });
    $('btnConfigCancel').addEventListener('click', () => $('configDialog').close());
    $('btnConfigClose').addEventListener('click', () => $('configDialog').close());
    $('btnRestaurarPadrao').addEventListener('click', () => preencherConfig(F.normalizeConfig({})));
    $('btnLimparRegistro').addEventListener('click', () => {
      const n = Object.keys(state.registro).length;
      if (!n) { alert('Não há registro de cobranças gravado neste navegador.'); return; }
      if (!confirm('Apagar o registro de cobranças de ' + n + ' plano(s) gravado neste navegador?\n\nO que já está na planilha exportada não é afetado. Esta ação não pode ser desfeita.')) return;
      state.registro = {};
      store.del(LS_REG);
      $('configDialog').close();
      reprocessar();
    });

    // Sobre / Criado por
    document.querySelectorAll('[data-sobre]').forEach(b => b.addEventListener('click', () => $('aboutDialog').showModal()));
    $('btnAboutClose').addEventListener('click', () => $('aboutDialog').close());
    $('aboutDialog').addEventListener('click', e => { if (e.target === $('aboutDialog')) $('aboutDialog').close(); });

    // Se a página ficar aberta de um dia para o outro, recalcula ao voltar.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && F.hoje().getTime() !== state.today.getTime()) reprocessar();
    });
  }

  iniciar();

  // Usado apenas pelos testes.
  window.FollowUpApp = { state, lerArquivo, carregarExemplo, reprocessar, filtrados };
})();
