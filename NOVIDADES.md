# Novidades

## Versão 2.1

- **Marca Auditor do Futuro no sistema:** símbolo no topo, cartão "Criado por" no rodapé e janela "Sobre", com treinamentos, mentoria e contato.
- **Manual com a identidade da marca** e uma seção final "Quem criou". O README ganhou a mesma seção.
- **O que não mudou de propósito:** os e-mails de cobrança, a planilha exportada, o modelo e a impressão continuam sem marca, porque são documentos de quem usa o sistema.
- A fonte da marca vem embutida na pasta `vendor/fonts`. O sistema continua sem carregar nada da internet. Os links da janela "Sobre" abrem sites externos só quando você clica.

## Versão 2.0

### O que muda no dia a dia

- **O sistema lembra quem já foi cobrado.** Cada cartão de cobrança tem o botão "Marcar como cobrado hoje". A data e a quantidade de cobranças aparecem na tela e vão para a planilha exportada (colunas "Última cobrança" e "Nº de cobranças").
  *Por quê:* antes não havia como saber quem já tinha sido cobrado, quando, nem quantas vezes.
- **Conferência da importação.** Ao carregar a planilha, um painel mostra as colunas reconhecidas, as que faltam, como cada status foi interpretado e as linhas com problema. Dá para trocar a coluna na hora e escolher a aba da planilha.
  *Por quê:* os erros de leitura eram silenciosos e só apareciam como números errados.
- **Configurações.** Assinatura, assunto, dias úteis para resposta, janela de "a vencer", limite de escalonamento, feriados e palavras que significam "concluído" ou "cancelado".
  *Por quê:* tudo isso era fixo no código.
- **Copiar e-mail formatado.** Copia a mensagem com a tabela de planos, pronta para colar no Outlook ou no Gmail. Há também "Copiar tudo (texto)", com destinatário e assunto, e botões para copiar cada campo.
- **Modelo de planilha.** O botão "Baixar modelo" gera uma planilha com as colunas certas e uma aba de instruções.
- **Funciona sem internet.** O leitor de Excel passou a vir junto, na pasta `vendor`.

### Correções

| Antes | Agora |
|---|---|
| Sem coluna de e-mail, o sistema criava endereços como `nome.sobrenome@empresa.com` e `gestao.area@empresa.com` | Nenhum endereço é inventado. O cartão avisa que falta o e-mail |
| Só "concluído", "concluída", "finalizado" e "ok" contavam como concluído | "Implementado", "Encerrado", "Concluído com ressalva" e outros também contam. A lista é configurável. Existe o status "Cancelado" |
| Plano sem prazo aparecia como "No prazo" | Status próprio "Sem prazo", com aviso na conferência |
| "31/02/2026" virava 03/03/2026; "10/11/26" era lido no formato americano | Data impossível ou ilegível é apontada como problema. Datas com ano de dois dígitos são lidas como dia/mês/ano |
| "Exportar" sempre levava todos os planos, mesmo com filtro; datas saíam como texto | Dois botões: planilha completa e só o filtro. Datas calculadas saem como data de verdade. O arquivo traz uma aba "Parâmetros" com a data-base |
| Texto da planilha era inserido na tela como HTML | Todo texto é tratado como texto |
| "Abrir no Outlook" podia cortar mensagens longas | Quando o texto não cabe no link, a mensagem abre com destinatário e assunto e o texto fica copiado para colar |
| Pessoas com o mesmo nome eram fundidas; e-mail e gestor vinham só do primeiro plano | Homônimos com e-mails diferentes ficam separados. A cópia para o gestor considera os planos escalonados |
| Ordenar por uma coluna de data ordenava pelo dia da semana | Ordem cronológica, com vazios no fim |
| "5 dias úteis" ignorava feriados | Feriados cadastrados nas configurações são descontados |
| "Vence em 0 dias" | "Vence hoje" |
| Só a primeira aba era lida | O sistema escolhe a aba que parece a lista de planos e permite trocar |
| A data de "hoje" ficava parada se a página ficasse aberta de um dia para o outro | Recalcula ao voltar para a página |
| O e-mail escalonado dizia que a gestão estava em cópia mesmo sem e-mail do gestor | A frase só aparece quando há cópia |

### Mudanças que você vai notar

- O sistema agora é uma pasta (`index.html`, `js`, `vendor`), não um arquivo só. Copie a pasta inteira.
- O botão "Abrir no Outlook" passou a se chamar "Abrir no programa de e-mail".
- O status "Vence em 7 dias" passou a se chamar "Vence em até N dias" e segue a configuração.
- A ordenação padrão coloca planos sem prazo logo depois dos que estão a vencer, antes dos que estão no prazo.
- O arquivo exportado mantém as suas colunas na ordem original e acrescenta as colunas calculadas no fim. Ele pode ser recarregado no sistema sem duplicar colunas.
- Passam a ficar gravados no navegador as configurações e o registro de cobranças (um código por plano e as datas). A planilha continua não sendo gravada.

## Versão 1.0

Primeira versão: painel de planos, cálculo de atraso, gráfico por área, filtros e e-mails de cobrança por responsável, em um único arquivo.
