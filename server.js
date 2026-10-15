const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ========== WEBSOCKET ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ Caixinha conectou!');
  
  ws.on('message', (mensagem) => {
    const texto = mensagem.toString();
    console.log('📩 Recebido:', texto);
    
    // Reenvia para o painel da web
    wss.clients.forEach((cliente) => {
      if (cliente !== ws && cliente.readyState === WebSocket.OPEN) {
        cliente.send(texto);
      }
    });
  });
  
  ws.on('close', () => {
    console.log('❌ Caixin
