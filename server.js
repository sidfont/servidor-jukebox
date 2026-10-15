const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ========== WEBSOCKET ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('✅ Caixinha conectou!');
  
  ws.on('message', (mensagem) => {
    const texto = mensagem.toString();
    console.log('📩 Recebido:', texto);
  });
  
  ws.on('close', () => {
    console.log('❌ Caixinha desconectou');
  });
});
// ================================

const db = new Datastore({ filename: 'faturamento_geral.db', autoload: true });

const BLYNK_TOKEN = "ASLzBlIjoi4Q2Vo-HVD-LiuYjI1Msr4gM";
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function obterQuantidadePulsos(valor) {
  if (valor >= 50) return 50;
  if (valor >= 20) return 20;
  if (valor >= 10) return 10;
  if (valor >= 5) return 5;
  if (valor >= 2) return 2;
  return 0;
}

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});
