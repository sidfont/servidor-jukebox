const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ========== BANCO DE DADOS — GUARDA OS VALORES PARA SEMPRE ==========
const db = new Datastore({ filename: 'faturamento.db', autoload: true });

// Inicializa ou carrega os dados de cada máquina
const maquinas = {};

// Carrega dados salvos quando o servidor liga
db.find({}, (err, docs) => {
  docs.forEach(doc => {
    maquinas[doc.nome] = { faturamento: doc.faturamento || 0 };
    console.log(`📂 Carregado: ${doc.nome} = R$ ${doc.faturamento.toFixed(2)}`);
  });
});

function salvarDados(nomeMaquina) {
  db.update({ nome: nomeMaquina }, { $set: { faturamento: maquinas[nomeMaquina].faturamento } }, { upsert: true });
}

// ========== WEBSOCKET ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('✅ Novo cliente conectou!');
  
  // Envia os valores atuais logo que alguém conecta
  ws.send(JSON.stringify({ tipo: 'dados', maquinas: maquinas }));
  
  ws.on('message', (mensagem) => {
    const texto = mensagem.toString();
    console.log('📩', texto);
    
    // Formato esperado: "adicionar:Box-01:2" = adiciona R$ 2,00
    if (texto.startsWith('adicionar:')) {
      const partes = texto.split(':');
      const nome = partes[1];
      const valor = parseInt(partes[2]);
      
      if (!maquinas[nome]) maquinas[nome] = { faturamento: 0 };
      maquinas[nome].faturamento += valor;
      salvarDados(nome);
      
      console.log(`💰 ${nome} + R$ ${valor},00 = R$ ${maquinas[nome].faturamento.toFixed(2)}`);
      
      // Avisa TODOS os navegadores conectados
      wss.clients.forEach((cliente) => {
        if (cliente.readyState === WebSocket.OPEN) {
          cliente.send(JSON.stringify({ 
            tipo: 'atualizacao',
            nome: nome,
            valor: maquinas[nome].faturamento 
          }));
        }
      });
    }
    
    // Zerar caixa
    if (texto.startsWith('zerar:')) {
      const nome = texto.split(':')[1];
      if (maquinas[nome]) {
        maquinas[nome].faturamento = 0;
        salvarDados(nome);
        console.log(`🔄 ${nome} zerada!`);
        
        wss.clients.forEach((cliente) => {
          if (cliente.readyState === WebSocket.OPEN) {
            cliente.send(JSON.stringify({ tipo: 'zerar', nome: nome }));
          }
        });
      }
    }
    
    // Reenvia mensagens da caixinha para o painel
    wss.clients.forEach((cliente) => {
      if (cliente !== ws && cliente.readyState === WebSocket.OPEN) {
        cliente.send(texto);
      }
    });
  });
  
  ws.on('close', () => {
    console.log('❌ Cliente desconectou');
  });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});
