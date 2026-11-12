// Testes automáticos das regras de negócio. Rodar com:  node --test
// Todos os dados aqui são fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const F = require('../js/logica.js');

const HOJE = new Date(2026, 10, 11); // 11/11/2026 (quarta-feira)
const d = (dia, mes, ano) => new Date(ano, mes - 1, dia);
const fmt = F.formatDate;

function proc(rows, cfg, registro) {
  const colunas = Object.keys(rows[0]);
  const mapa = F.detectarColunas(colunas);
  return Object.assign(F.processar(rows, colunas, mapa, cfg || {}, HOJE, registro || {}), { colunas, mapa });
}

const BASE = { 'ID': 1, 'Plano de Ação': 'Plano A', 'Responsável': 'Fulano de Tal', 'Email': 'fulano@exemplo.com.br', 'Área': 'TI', 'Risco': 'Médio', 'Status': 'Em andamento', 'Prazo acordado': '01/11/2026', 'Prazo reprogramado': '' };
const linha = extra => Object.assign({}, BASE, extra);

// ---------------------------------------------------------------- datas
test('datas: lê dd/mm/aaaa, dd/mm/aa, ISO, número de série e Date', () => {
  assert.equal(fmt(F.parseDate('10/11/2026')), '10/11/2026');
  assert.equal(fmt(F.parseDate('1-2-2026')), '01/02/2026');
  assert.equal(fmt(F.parseDate('10/11/26')), '10/11/2026');
  assert.equal(fmt(F.parseDate('2026-11-10')), '10/11/2026');
  assert.equal(fmt(F.parseDate('10/11/2026 00:00')), '10/11/2026');
  assert.equal(fmt(F.parseDate(46337)), '11/11/2026');
  assert.equal(fmt(F.parseDate(new Date(2026, 10, 10, 23, 59, 45))), '11/11/2026', 'segundos antes da meia-noite arredondam');
  assert.equal(fmt(F.parseDate(new Date(2026, 10, 10, 15, 0, 0))), '10/11/2026');
});

test('datas: rejeita data impossível e texto que não é data (D5)', () => {
  assert.equal(F.parseDate('31/02/2026'), null);
  assert.equal(F.parseDate('a definir'), null);
  assert.equal(F.parseDate('11/13/2026'), null, 'não tenta formato americano');
  assert.equal(F.parseDate(''), null);
  assert.equal(F.dataInvalida('31/02/2026'), true);
  assert.equal(F.dataInvalida(''), false);
  assert.equal(F.dataInvalida('10/11/2026'), false);
});

test('datas: número de série ida e volta', () => {
  assert.equal(F.dateToSerial(d(11, 11, 2026)), 46337);
  assert.equal(fmt(F.parseDate(F.dateToSerial(d(29, 2, 2028)))), '29/02/2028');
});

test('dias úteis: pula fim de semana e feriados configurados', () => {
  assert.equal(fmt(F.addDiasUteis(HOJE, 5, new Set())), '18/11/2026');
  const fer = F.parseFeriados('16/11/2026\n20/11/2026 Consciência Negra\nxx');
  assert.deepEqual(fer.invalidos, ['xx']);
  assert.equal(fmt(F.addDiasUteis(HOJE, 5, fer.set)), '19/11/2026');
});

// ---------------------------------------------------------------- status
test('status: palavras de conclusão e cancelamento (D3)', () => {
  const cfg = F.normalizeConfig({});
  for (const s of ['Concluído', 'concluida', 'FINALIZADO', 'Implementado', 'Encerrado', 'Concluído com ressalva', 'OK'])
    assert.equal(F.interpretarStatus(s, cfg), 'CONCLUIDO', s);
  for (const s of ['Cancelado', 'Não aplicável'])
    assert.equal(F.interpretarStatus(s, cfg), 'CANCELADO', s);
  for (const s of ['Em andamento', 'Não iniciado', 'Não concluído', 'Em implementação', ''])
    assert.equal(F.interpretarStatus(s, cfg), 'ABERTO', s);
  assert.equal(F.interpretarStatus('Baixado pela gestão', F.normalizeConfig({ palavrasConcluido: 'baixado', palavrasCancelado: 'x' })), 'CONCLUIDO');
});

test('status calculado: atrasado, a vencer, vence hoje, no prazo, sem prazo', () => {
  const r = proc([
    linha({ ID: 1, 'Prazo acordado': '01/11/2026' }),
    linha({ ID: 2, 'Prazo acordado': '18/11/2026' }),
    linha({ ID: 3, 'Prazo acordado': '11/11/2026' }),
    linha({ ID: 4, 'Prazo acordado': '19/11/2026' }),
    linha({ ID: 5, 'Prazo acordado': '' }),
    linha({ ID: 6, 'Prazo acordado': '01/10/2026', 'Prazo reprogramado': '30/11/2026' }),
    linha({ ID: 7, 'Prazo acordado': '01/10/2026', Status: 'Implementado' }),
    linha({ ID: 8, 'Prazo acordado': '01/10/2026', Status: 'Cancelado' })
  ]);
  assert.deepEqual(r.itens.map(i => i.statusKey), ['ATRASADO', 'A_VENCER', 'A_VENCER', 'NO_PRAZO', 'SEM_PRAZO', 'NO_PRAZO', 'CONCLUIDO', 'CANCELADO']);
  assert.equal(r.itens[0].diasAtraso, 10);
  assert.equal(r.itens[2].statusLabel, 'Vence hoje');
  assert.equal(r.itens[5].tipoPrazo, 'Reprogramado');
});

test('conferência: sem prazo e data inválida viram problema visível (D4, D5)', () => {
  const r = proc([
    linha({ ID: 'A', 'Prazo acordado': '' }),
    linha({ ID: 'B', 'Prazo acordado': 'a definir' }),
    linha({ ID: 'C', 'Prazo acordado': '31/02/2026' }),
    linha({ ID: 'D', 'Prazo acordado': '', Status: 'Concluído' }),
    linha({ ID: 'E', 'Responsável': '', Email: 'nao-e-email' })
  ]);
  assert.deepEqual(r.itens.slice(0, 3).map(i => i.statusKey), ['SEM_PRAZO', 'SEM_PRAZO', 'SEM_PRAZO']);
  const de = id => r.problemas.filter(p => p.id === id).map(p => p.msg).join(' | ');
  assert.match(de('A'), /sem prazo informado/);
  assert.match(de('B'), /"a definir" não é uma data válida/);
  assert.match(de('C'), /"31\/02\/2026" não é uma data válida/);
  assert.equal(de('D'), '', 'concluído sem prazo não é problema');
  assert.match(de('E'), /sem responsável/);
  assert.match(de('E'), /formato inválido/);
  assert.equal(r.problemas.find(p => p.id === 'B').linha, 3);
  assert.equal(r.itens[4].email, '', 'e-mail inválido não é usado');
});

test('conferência: resumo de como cada status foi interpretado', () => {
  const r = proc([linha({}), linha({ Status: 'Implementado' }), linha({ Status: 'Implementado' })]);
  assert.deepEqual(r.statusResumo, [
    { valor: 'Implementado', qtd: 2, interpretacao: 'CONCLUIDO' },
    { valor: 'Em andamento', qtd: 1, interpretacao: 'ABERTO' }
  ]);
});

// ---------------------------------------------------------------- colunas
test('colunas: planilha só com as colunas básicas gera avisos, sem inventar nada (D1)', () => {
  const colunas = ['ID', 'Plano de Ação', 'Responsável', 'Área', 'Status', 'Prazo acordado', 'Prazo reprogramado', 'Observações'];
  const m = F.detectarColunas(colunas);
  assert.equal(m.plano, 'Plano de Ação');
  assert.equal(m.prazoAcordado, 'Prazo acordado');
  assert.equal(m.prazoReprogramado, 'Prazo reprogramado');
  assert.equal(m.email, '');
  assert.equal(m.risco, '');
  const rows = [{ 'ID': 7, 'Plano de Ação': 'P', 'Responsável': 'Fulano de Tal', 'Área': 'TI', 'Status': 'Em andamento', 'Prazo acordado': '01/01/2026', 'Prazo reprogramado': '', 'Observações': '' }];
  const r = F.processar(rows, colunas, m, {}, HOJE, {});
  assert.equal(r.avisos.length, 3);
  assert.match(r.avisos.join(' '), /não inventa endereços/);
  const g = F.agruparCobrancas(r.itens, {});
  assert.equal(g[0].email, '');
  const email = F.montarEmail(g[0], {}, HOJE);
  assert.equal(email.to, '');
  assert.equal(email.cc, '');
  assert.ok(!/@empresa\.com/.test(JSON.stringify(email)), 'nenhum endereço fabricado');
  assert.ok(F.montarMailto(email).url.startsWith('mailto:?subject='));
});

test('colunas: distingue e-mail do responsável, gestor e e-mail do gestor', () => {
  const m = F.detectarColunas(['Cód', 'Observação', 'Descrição da ação', 'E-mail do Gestor', 'E-mail', 'Gestor', 'Novo prazo', 'Prazo', 'Situação', 'Criticidade', 'Dono', 'Setor']);
  assert.equal(m.gestorEmail, 'E-mail do Gestor');
  assert.equal(m.email, 'E-mail');
  assert.equal(m.gestor, 'Gestor');
  assert.equal(m.prazoReprogramado, 'Novo prazo');
  assert.equal(m.prazoAcordado, 'Prazo');
  assert.equal(m.plano, 'Descrição da ação', 'não confunde com Observação');
  assert.equal(m.status, 'Situação');
  assert.equal(m.risco, 'Criticidade');
  assert.equal(m.responsavel, 'Dono');
  assert.equal(m.area, 'Setor');
  assert.equal(m.id, 'Cód');
});

test('colunas: coluna Gestor com e-mail dentro é usada como e-mail do gestor', () => {
  const r = proc([linha({ Gestor: 'chefe@exemplo.com.br', Risco: 'Alto' })]);
  assert.equal(r.itens[0].gestorEmail, 'chefe@exemplo.com.br');
  assert.equal(r.itens[0].gestorNome, '');
});

test('colunas: reimportar o arquivo exportado ignora as colunas calculadas', () => {
  const m = F.detectarColunas(['ID', 'Plano de Ação', 'Responsável', 'Status', 'Prazo acordado', 'Última cobrança', 'Nº de cobranças', 'Status calculado', 'Dias de atraso', 'Prazo vigente', 'Tipo de prazo']);
  assert.equal(m.status, 'Status');
  assert.equal(m.prazoAcordado, 'Prazo acordado');
  assert.equal(m.ultimaCobranca, 'Última cobrança');
  assert.equal(m.numCobrancas, 'Nº de cobranças');
});

// ---------------------------------------------------------------- cobranças
test('escalonamento: atraso acima do limite ou risco alto em atraso', () => {
  const r = proc([
    linha({ ID: 1, 'Prazo acordado': '01/08/2026' }),                  // 102 dias
    linha({ ID: 2, 'Prazo acordado': '10/11/2026', Risco: 'Alto' }),   // 1 dia, risco alto
    linha({ ID: 3, 'Prazo acordado': '10/11/2026' }),                  // 1 dia, médio
    linha({ ID: 4, 'Prazo acordado': '15/11/2026', Risco: 'Alto' })    // a vencer
  ]);
  const cfg = F.normalizeConfig({});
  assert.deepEqual(r.itens.map(i => F.itemEscalonado(i, cfg)), [true, true, false, false]);
  const semRisco = F.normalizeConfig({ escalonarRiscoAlto: false, diasEscalonamento: 200 });
  assert.deepEqual(r.itens.map(i => F.itemEscalonado(i, semRisco)), [false, false, false, false]);
});

test('agrupamento: homônimos com e-mails diferentes ficam separados; gestor vem dos planos escalonados (D9)', () => {
  const r = proc([
    linha({ ID: 1, 'Responsável': 'Ana Silva', Email: 'ana.silva@exemplo.com.br', 'Email do Gestor': 'g1@exemplo.com.br', Risco: 'Alto' }),
    linha({ ID: 2, 'Responsável': 'Ana Silva', Email: 'ana.silva2@exemplo.com.br', 'Email do Gestor': 'g2@exemplo.com.br' }),
    linha({ ID: 3, 'Responsável': 'ana silva', Email: '', 'Email do Gestor': 'g3@exemplo.com.br', Risco: 'Alto' }),
    linha({ ID: 4, 'Responsável': 'Beto Lima', Email: 'beto@exemplo.com.br', 'Email do Gestor': 'g1@exemplo.com.br' }),
    linha({ ID: 5, 'Responsável': 'Beto Lima', Email: '', 'Email do Gestor': 'g1@exemplo.com.br', Risco: 'Alto' })
  ]);
  const g = F.agruparCobrancas(r.itens, {});
  assert.equal(g.length, 4);
  const beto = g.find(x => x.responsavel === 'Beto Lima');
  assert.equal(beto.itens.length, 2, 'linha sem e-mail herda o e-mail único da mesma pessoa');
  assert.equal(beto.email, 'beto@exemplo.com.br');
  assert.equal(beto.cc, 'g1@exemplo.com.br');
  const semEmail = g.find(x => x.email === '');
  assert.equal(semEmail.itens[0].customId, '3', 'ambíguo: não herda e-mail de homônimo');
  const ana2 = g.find(x => x.email === 'ana.silva2@exemplo.com.br');
  assert.equal(ana2.escalonado, false);
  assert.equal(ana2.cc, '', 'sem escalonamento não há cópia');
});

test('e-mail: tom, prazos configuráveis, assinatura e HTML sem injeção (D7)', () => {
  const r = proc([
    linha({ ID: '<b>1</b>', 'Plano de Ação': 'Plano <img src=x onerror=alert(1)>', Risco: 'Alto', 'Email do Gestor': 'gestor@exemplo.com.br' }),
    linha({ ID: 2, 'Prazo acordado': '11/11/2026' })
  ]);
  const cfg = { assinatura: 'Auditoria <Teste>\nLinha 2', assunto: 'Assunto X', diasResposta: 3, diasEscalonamento: 45 };
  const g = F.agruparCobrancas(r.itens, cfg);
  assert.equal(g.length, 1);
  const e = F.montarEmail(g[0], cfg, HOJE);
  assert.equal(e.subject, 'Assunto X');
  assert.equal(e.cc, 'gestor@exemplo.com.br');
  assert.match(e.text, /^Olá, Fulano,\n/);
  assert.match(e.text, /atraso superior a 45 dias/);
  assert.match(e.text, /até o dia 16\/11\/2026 \(prazo de 3 dias úteis/);
  assert.match(e.text, /gestão imediata em cópia/);
  assert.match(e.text, /Situação: Vence hoje/);
  assert.match(e.text, /Auditoria <Teste>\nLinha 2$/);
  assert.ok(!e.html.includes('<img'), 'HTML do plano escapado');
  assert.ok(!e.html.includes('<b>1</b>'));
  assert.ok(e.html.includes('Auditoria &lt;Teste&gt;<br>Linha 2'));
  assert.equal(F.escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#039;&amp;');
});

test('e-mail escalonado sem e-mail do gestor não afirma que há cópia', () => {
  const r = proc([linha({ Risco: 'Alto' })]);
  const e = F.montarEmail(F.agruparCobrancas(r.itens, {})[0], {}, HOJE);
  assert.equal(e.escalonado, true);
  assert.equal(e.cc, '');
  assert.ok(!/em cópia/.test(e.text));
});

test('mailto: mensagem longa vira link curto, sem corpo (D8)', () => {
  const r = proc([linha({})]);
  const curto = F.montarMailto(F.montarEmail(F.agruparCobrancas(r.itens, {})[0], {}, HOJE));
  assert.equal(curto.curto, false);
  assert.ok(curto.url.length <= F.LIMITE_MAILTO);
  assert.ok(curto.url.startsWith('mailto:fulano@exemplo.com.br?subject='));
  assert.ok(curto.url.includes('&body='));

  const muitos = proc(Array.from({ length: 12 }, (_, i) => linha({ ID: i + 1, 'Plano de Ação': 'Plano de ação número ' + (i + 1) + ' com um título comprido' })));
  const longo = F.montarMailto(F.montarEmail(F.agruparCobrancas(muitos.itens, {})[0], {}, HOJE));
  assert.equal(longo.curto, true);
  assert.ok(!longo.url.includes('body='));
  assert.ok(longo.url.length < 400);
});

// ---------------------------------------------------------------- registro de cobranças
test('registro: combina planilha e marcações locais sem contar em dobro', () => {
  assert.deepEqual(F.combinarCobrancas(null, 0, []), { ultima: null, n: 0, naoGravadas: 0 });
  let c = F.combinarCobrancas(null, 0, ['2026-11-01', '2026-11-11']);
  assert.equal(c.n, 2); assert.equal(fmt(c.ultima), '11/11/2026'); assert.equal(c.naoGravadas, 2);
  c = F.combinarCobrancas(d(11, 11, 2026), 2, ['2026-11-01', '2026-11-11']);
  assert.equal(c.n, 2, 'reimportar o arquivo exportado não duplica'); assert.equal(c.naoGravadas, 0);
  c = F.combinarCobrancas(d(1, 11, 2026), 1, ['2026-11-01', '2026-11-11']);
  assert.equal(c.n, 2); assert.equal(c.naoGravadas, 1);
  c = F.combinarCobrancas(d(1, 11, 2026), '', []);
  assert.equal(c.n, 1, 'data sem quantidade conta como 1');
});

test('registro: marcação aparece no item e a chave não guarda dados pessoais', () => {
  const rows = [linha({})];
  const chave = F.chavePlano('1', 'Plano A', 'Fulano de Tal');
  assert.match(chave, /^[a-z0-9]+$/);
  assert.ok(!/fulano|plano/i.test(chave));
  const r = proc(rows, {}, { [chave]: ['2026-11-11'] });
  assert.equal(r.itens[0].numCobrancas, 1);
  assert.equal(r.itens[0].cobradoHoje, true);
  assert.equal(r.itens[0].cobrancasNaoGravadas, 1);
  assert.equal(F.agruparCobrancas(r.itens, {})[0].cobradoHoje, true);
});

// ---------------------------------------------------------------- ordenação e exportação
test('ordenação: datas em ordem cronológica, vazios no fim (D10)', () => {
  const r = proc([
    linha({ ID: 1, 'Prazo acordado': '01/12/2026' }),
    linha({ ID: 2, 'Prazo acordado': '' }),
    linha({ ID: 3, 'Prazo acordado': '20/11/2026' }),
    linha({ ID: 4, 'Prazo acordado': new Date(2027, 0, 5) })
  ]);
  const ids = () => r.itens.map(i => i.customId).join('');
  F.ordenarPor(r.itens, 'orig_Prazo acordado', 'asc'); assert.equal(ids(), '3142');
  F.ordenarPor(r.itens, 'orig_Prazo acordado', 'desc'); assert.equal(ids(), '4132');
  F.ordenarPor(r.itens, 'prazoEfetivo', 'asc'); assert.equal(ids(), '3142');
  F.ordenarPor(r.itens, 'orig_ID', 'desc'); assert.equal(ids(), '4321');
});

test('ordenação padrão: mais atrasado primeiro, concluídos no fim', () => {
  const r = proc([
    linha({ ID: 1, Status: 'Concluído' }),
    linha({ ID: 2, 'Prazo acordado': '15/11/2026' }),
    linha({ ID: 3, 'Prazo acordado': '01/11/2026' }),
    linha({ ID: 4, 'Prazo acordado': '01/09/2026' }),
    linha({ ID: 5, 'Prazo acordado': '' })
  ]);
  F.ordenarPadrao(r.itens);
  assert.equal(r.itens.map(i => i.customId).join(''), '43251');
});

test('exportação: mantém colunas originais, grava cobranças e datas de verdade (D6)', () => {
  const rows = [linha({ ID: 1 }), linha({ ID: 2, 'Prazo acordado': '', Status: 'Concluído' })];
  const chave = F.chavePlano('1', 'Plano A', 'Fulano de Tal');
  const r = proc(rows, {}, { [chave]: ['2026-11-11'] });
  const exp = F.montarExportacao(r.itens, r.colunas, r.mapa);
  assert.deepEqual(exp.header, [...r.colunas, 'Última cobrança', 'Nº de cobranças', 'Status calculado', 'Dias de atraso', 'Prazo vigente', 'Tipo de prazo']);
  const col = nome => exp.header.indexOf(nome);
  assert.ok(exp.linhas[0][col('Última cobrança')] instanceof Date);
  assert.equal(exp.linhas[0][col('Nº de cobranças')], 1);
  assert.equal(exp.linhas[0][col('Status calculado')], 'Atrasado');
  assert.ok(exp.linhas[0][col('Prazo vigente')] instanceof Date);
  assert.equal(exp.linhas[0][col('Prazo acordado')], '01/11/2026', 'dado original não é alterado');
  assert.equal(exp.linhas[1][col('Tipo de prazo')], '', 'sem prazo não sai como "Acordado"');
  assert.equal(exp.linhas[1][col('Prazo vigente')], '');
});

test('exportação: arquivo Excel gerado é relido com os mesmos resultados (ida e volta)', () => {
  const XLSX = require(path.join('..', 'vendor', 'xlsx.full.min.js'));
  const rows = [linha({ ID: 1 }), linha({ ID: 2, 'Prazo acordado': '20/11/2026' })];
  const chave = F.chavePlano('1', 'Plano A', 'Fulano de Tal');
  const reg = { [chave]: ['2026-11-11'] };
  const r = proc(rows, {}, reg);
  const exp = F.montarExportacao(r.itens, r.colunas, r.mapa);

  // mesma técnica usada pela tela: datas como número de série com formato de data
  const aoa = [exp.header].concat(exp.linhas.map(l => l.map(v => (v instanceof Date ? F.dateToSerial(v) : v))));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  exp.linhas.forEach((l, ri) => l.forEach((v, ci) => { if (v instanceof Date) ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })].z = 'dd/mm/yyyy'; }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Follow-up');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets['Follow-up'], { defval: '' });
  const colunas2 = Object.keys(rows2[0]);
  const mapa2 = F.detectarColunas(colunas2);
  const r2 = F.processar(rows2, colunas2, mapa2, {}, HOJE, reg);
  assert.deepEqual(r2.itens.map(i => i.statusKey), ['ATRASADO', 'NO_PRAZO']);
  assert.equal(fmt(r2.itens[0].ultimaCobranca), '11/11/2026');
  assert.equal(r2.itens[0].numCobrancas, 1, 'não conta em dobro ao reimportar');
  assert.equal(r2.itens[0].cobrancasNaoGravadas, 0);
  assert.equal(r2.itens[0].linha, 2);
  const exp2 = F.montarExportacao(r2.itens, colunas2, mapa2);
  assert.deepEqual(exp2.header, exp.header, 'colunas não se multiplicam a cada rodada');
});

test('configuração: valores fora da faixa voltam para limites seguros', () => {
  const c = F.normalizeConfig({ diasResposta: 'abc', janelaVencer: -5, diasEscalonamento: 99999, assinatura: '   ' });
  assert.equal(c.diasResposta, 5);
  assert.equal(c.janelaVencer, 0);
  assert.equal(c.diasEscalonamento, 3650);
  assert.equal(c.assinatura, F.DEFAULT_CONFIG.assinatura);
});
