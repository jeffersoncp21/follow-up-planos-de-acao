<p align="center"><img src="docs/img/logo-af.png" width="84" alt="Auditor do Futuro"></p>

# Follow-up de Planos de Ação

Criado por **Jefferson Cavalcante** · [Auditor do Futuro](https://aiauditor.com.br/)

Sistema para a Auditoria Interna acompanhar planos de ação: lê a planilha de planos, calcula atrasos, monta os e-mails de cobrança por responsável e registra quem já foi cobrado.

Abre direto no navegador. Não tem instalação, servidor nem cadastro, e funciona sem internet.

> **Primeira vez aqui?** Siga o **[Manual de instalação e uso](docs/MANUAL.md)** ([versão em PDF](docs/Manual-Follow-up-Planos-de-Acao.pdf)). Ele mostra o passo a passo com imagens das telas.

## Como abrir

1. Baixe a pasta completa do projeto (o `index.html` precisa das pastas `js` e `vendor` ao lado dele).
2. Dê dois cliques em `index.html`. Ele abre no navegador (Chrome ou Edge).
3. Clique em **Dados de exemplo** para conhecer, ou em **Baixar modelo** para começar a sua planilha.

## Como usar

1. **Carregue a planilha** (.xlsx ou .xls) clicando na faixa de envio ou arrastando o arquivo.
2. **Confira a importação.** O painel "Conferência da importação" mostra as colunas reconhecidas, as colunas que faltam, como cada status foi interpretado e as linhas com problema (prazo inválido, sem responsável, e-mail errado). Se o sistema escolheu a coluna errada, troque ali mesmo.
3. **Veja a visão geral:** indicadores, atrasos por área, filtros, busca e ordenação.
4. **Cobre os responsáveis** na aba "Cobranças por Responsável". Cada cartão tem o e-mail pronto. Use **Copiar e-mail formatado** (com tabela) ou **Abrir no programa de e-mail**.
5. **Marque como cobrado hoje** depois de enviar.
6. **Exporte a planilha completa** ao final. Ela leva o status calculado e o registro de cobranças. Use esse arquivo como base na próxima rodada.

## Colunas da planilha

O cabeçalho deve estar na linha 1. Os nomes não precisam ser idênticos; o sistema reconhece variações comuns (por exemplo, "Situação" no lugar de "Status").

| Coluna | Para que serve | Se faltar |
|---|---|---|
| Plano de Ação | Texto do plano | Aparece como "Plano de ação #n" |
| Responsável | Agrupa as cobranças | Não há como agrupar por pessoa |
| Email | Destinatário da cobrança | O e-mail sai sem destinatário (o sistema **não inventa** endereços) |
| Email do Gestor | Cópia nos e-mails escalonados | O e-mail escalonado sai sem cópia |
| Risco | Alto, Médio ou Baixo | Não há escalonamento por risco |
| Status | Concluído, Cancelado ou em aberto | Todos os planos contam como em aberto |
| Prazo acordado | Data do prazo original | Não há cálculo de atraso |
| Prazo reprogramado | Substitui o prazo acordado, quando preenchido | Vale o prazo acordado |
| Última cobrança, Nº de cobranças | Preenchidas pelo sistema na exportação | São criadas na primeira exportação |

Outras colunas (ID, Área, Gestor, Observações e quaisquer colunas suas) aparecem na tela e são mantidas na exportação.

## Regras de cálculo

- **Atrasado:** plano em aberto com prazo vigente anterior a hoje.
- **A vencer:** vence hoje ou nos próximos 7 dias.
- **Sem prazo:** plano em aberto sem data válida. Aparece separado, nunca como "no prazo".
- **Escalonado:** atraso acima de 60 dias, ou Risco Alto em atraso. O e-mail tem tom mais firme e leva o gestor em cópia.
- **Prazo de resposta pedido no e-mail:** 5 dias úteis, sem contar sábados, domingos e os feriados que você cadastrar.

Todos esses números, a assinatura, o assunto do e-mail e as palavras que significam "concluído" ou "cancelado" podem ser alterados em **⚙️ Configurações**.

## Dados e privacidade

- A planilha é lida dentro do navegador e fica só na memória. Ao fechar a página, some.
- O sistema não faz nenhuma conexão com a internet por conta própria. O leitor de Excel e a fonte da marca estão embutidos na pasta `vendor`. Os links da janela "Sobre" abrem sites externos só quando você clica.
- Ficam gravados no navegador (armazenamento local) apenas:
  - as configurações (assinatura, assunto, prazos, feriados, palavras de status);
  - o registro de cobranças: um código por plano e as datas das cobranças. Não há nomes, e-mails nem textos dos planos.
- Para apagar o que está gravado: ⚙️ Configurações → "Apagar registro de cobranças".
- Os dados só saem da tela quando você aciona: copiar (área de transferência), abrir no programa de e-mail, exportar o Excel ou imprimir.
- Se a pasta do sistema ou a sua planilha estiverem dentro do OneDrive, Google Drive ou similar, esses arquivos são sincronizados com a nuvem por esses programas, não pelo sistema.

## Limitações conhecidas

- O cabeçalho precisa estar na primeira linha da aba.
- O registro de cobranças vale por navegador e por computador. Para levar o histórico adiante com segurança, exporte a planilha completa e use-a na rodada seguinte.
- O botão "Abrir no programa de e-mail" abre a mensagem em texto simples. Quando o texto é longo demais para o link, a mensagem abre só com destinatário e assunto, e o texto fica copiado para colar.
- O leitor de Excel embutido é o SheetJS 0.18.5. Abra apenas planilhas de origem conhecida.

## Para quem for mexer no código

```
index.html        tela e estilos
js/logica.js      regras de negócio (datas, status, colunas, e-mails, exportação)
js/app.js         leitura do arquivo, tela e cliques
vendor/           leitor de Excel (SheetJS 0.18.5, licença Apache 2.0) e fonte Unbounded (licença OFL)
tests/            testes automáticos das regras
```

Para rodar os testes (precisa do Node.js 18 ou mais novo):

```bash
node --test
```

Veja o que mudou em cada versão em [NOVIDADES.md](NOVIDADES.md).

## Quem criou

O Follow-up de Planos de Ação foi criado por **Jefferson Cavalcante**, auditor e instrutor de IA aplicada à auditoria interna, à frente do **Auditor do Futuro**. A ferramenta é gratuita: use e compartilhe com o seu time.

### Acesse pelo celular

| Mentoria anual | Treinamentos | LinkedIn |
|---|---|---|
| <img src="docs/img/qr-mentoria.png" width="150" alt="QR Code: mentoria"> | <img src="docs/img/qr-treinamentos.png" width="150" alt="QR Code: treinamentos"> | <img src="docs/img/qr-linkedin.png" width="150" alt="QR Code: LinkedIn"> |
| [aiauditor.com.br/mentoria](https://aiauditor.com.br/mentoria/) | [aiauditor.com.br/cursos](https://aiauditor.com.br/cursos/) | [linkedin.com/in/jefferson-pereira](https://www.linkedin.com/in/jefferson-pereira/) |

### Treinamentos, mentoria e conteúdo

| O que é | Para quem | Link |
|---|---|---|
| Treinamentos | Quem quer aplicar Claude e Copilot na auditoria interna | [aiauditor.com.br/cursos](https://aiauditor.com.br/cursos/) |
| Mentoria anual | Auditores que querem acompanhamento individual | [aiauditor.com.br/mentoria](https://aiauditor.com.br/mentoria/) |
| Soluções para times | Áreas de auditoria: Método 3X, implantação e in company | [aiauditor.com.br/solucoes](https://aiauditor.com.br/solucoes/) |
| Ebook: Método 3X | Quem quer começar lendo | [ebook.aiauditor.com.br](https://ebook.aiauditor.com.br/) |
| Diagnóstico gratuito | Quem quer avaliar a auditoria antes de colocar IA | [aiauditor.com.br/diagnostico](https://aiauditor.com.br/diagnostico/) |

### Contato e redes

| Canal | Endereço |
|---|---|
| LinkedIn | [linkedin.com/in/jefferson-pereira](https://www.linkedin.com/in/jefferson-pereira/) |
| Site e contato por WhatsApp | [aiauditor.com.br/jefferson](https://aiauditor.com.br/jefferson/) |
| Código e novidades da ferramenta | [github.com/jeffersoncp21/follow-up-planos-de-acao](https://github.com/jeffersoncp21/follow-up-planos-de-acao) |
