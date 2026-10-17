const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const cors = require('cors');
const https = require('https');

const app = express();
const PORTA = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Armazena conexões das caixinhas
const caixinhas = new Map();

// ==============================
// WEBHOOK DO ASAAS
// ==============================
app.post('/webhook-asaas', (req, res) => {
  const evento = req.body;
  
  console.log('📩 Notificação recebida do Asaas:');
  console.log(JSON.stringify(evento, null, 2));

  // Verifica se é um pagamento CONFIRMADO
  if (evento.event === 'PAYMENT_CONFIRMED') {
    const valor = evento.payment.value;
    const referencia = evento.payment.externalReference || '';
    const descricao = evento.payment.description || '';
    const valorTotal = parseFloat(valor);

    console.log(`💰 Pagamento confirmado! Valor: R$ ${valorTotal.toFixed(2)}, Ref: ${referencia} - ${descricao}`);

    // ✅ REGRA: Só aceita valor inteiro
    if (!Number.isInteger(valorTotal) || valorTotal <= 0) {
      console.log(`⚠️ Valor com centavos ou inválido — NENHUM pulso enviado`);
      return res.status(200).send('Valor ignorado');
    }

    const pulsos = Math.round(valorTotal);
    console.log(`✅ ${valorTotal.toFixed(2)} = ${pulsos} pulsos`);

    // Identifica qual box é pela referência ou descrição
    let boxAlvo = 'BOX-01';
    if (referencia.includes('02') || descricao.includes('BOX-02') || descricao.includes('02')) {
      boxAlvo = 'BOX-02';
    } else if (referencia.includes('01') || descricao.includes('BOX-01') || descricao.includes('01')) {
      boxAlvo = 'BOX-01';
    }

    // Envia pulso para a caixinha correspondente
    if (caixinhas.has(boxAlvo)) {
      caixinhas.get(boxAlvo).send(JSON.stringify({
        tipo: 'pulsos',
        quantidade: pulsos,
        valor: valorTotal
      }));
      console.log(`📡 Enviado ${pulsos} pulsos para ${boxAlvo}`);
    } else {
      console.log(`⚠️ ${boxAlvo} não está conectada no momento`);
    }
  }

  res.status(200).send('OK');
});

// ==============================
// WEB SOCKET — Comunicação com as caixinhas ESP32
// ==============================
const servidorWS = new WebSocket.Server({ noServer: true });

servidorWS.on('connection', (ws) => {
  let boxId = 'BOX-01';

  ws.on('message', (mensagem) => {
    try {
      const dados = JSON.parse(mensagem);
      
      if (dados.tipo === 'identificacao' && dados.boxId) {
        boxId = dados.boxId;
        caixinhas.set(boxId, ws);
        console.log(`✅ ${boxId} conectada ao servidor`);
        ws.send(JSON.stringify({ tipo: 'status', online: true }));
      }
    } catch (erro) {
      console.log('Erro ao processar mensagem:', erro.message);
    }
  });

  ws.on('close', () => {
    caixinhas.delete(boxId);
    console.log(`❌ ${boxId} desconectou`);
  });

  ws.on('error', (erro) => {
    console.log(`Erro na conexão de ${boxId}:`, erro.message);
  });
});

// Integra WebSocket com Express
app.server = app.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});

app.server.on('upgrade', (requisicao, socket, cabecalhos) => {
  servidorWS.handleUpgrade(requisicao, socket, cabecalhos, (ws) => {
    servidorWS.emit('connection', ws, requisicao);
  });
});

console.log('✅ Sistema pronto — Aguardando pagamentos e caixinhas!');
