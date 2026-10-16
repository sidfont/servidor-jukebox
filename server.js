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

// ========== 🔐 Credenciais do Mercado Pago ==========
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || '';

// ========== 📂 Banco de dados ==========
const db = new Datastore({ filename: 'jukebox.db', autoload: true });

const maquinas = {
  'Box-01': { faturamento: 0, online: false, ultimaAtualizacao: null },
  'Box-02': { faturamento: 0, online: false, ultimaAtualizacao: null }
};

db.find({}, (err, docs) => {
  docs.forEach(doc => {
    if (maquinas[doc.nome]) {
      maquinas[doc.nome].faturamento = doc.faturamento || 0;
    }
  });
  console.log('📂 Dados carregados');
});

function salvarMaquina(nome) {
  db.update({ nome }, { $set: { faturamento: maquinas[nome].faturamento } }, { upsert: true });
}

// ========== 🌐 Webhook — Mercado Pago ==========
app.post('/webhook-mercadopago', async (req, res) => {
  try {
    const dados = req.body;
    console.log('💰 Notificação recebida:', dados);

    // Processa notificação do Mercado Pago
    if (dados.topic === 'payment' || dados.type === 'payment') {
      const paymentId = dados.resource || dados.data?.id;
      
      if (paymentId) {
        // Consulta os detalhes do pagamento
        const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
        const resposta = await axios.get(url, {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
        });
        
        const pagamento = resposta.data;
        
        // Só processa se foi APROVADO
        if (pagamento.status === 'approved') {
          const valor = pagamento.transaction_amount;
          const referencia = pagamento.external_reference || pagamento.description || 'Box-01';
          
          console.log(`✅ Pagamento aprovado: R$ ${valor} - Ref: ${referencia}`);
          processarPagamento(referencia, valor);
        }
      }
    }
    
    res.status(200).send({ ok: true });
  } catch (erro) {
    console.error('❌ Erro no webhook:', erro.message);
    res.status(500).send({ erro: 'erro interno' });
  }
});

// ========== ⚡ Processar Pagamento ==========
function processarPagamento(identificador, valor) {
  // Identifica qual máquina
  let nomeMaquina = 'Box-01';
  
  for (const nome in maquinas) {
    if (identificador.includes(nome)) {
      nomeMaquina = nome;
      break;
    }
  }

  if (!maquinas[nomeMaquina]) {
    console.log(`⚠️ Máquina não encontrada: ${identificador}`);
    return;
  }

  // Soma no faturamento
  maquinas[nomeMaquina].faturamento += valor;
  salvarMaquina(nomeMaquina);

  // Converte valor → pulsos
  let pulsos = 0;
  if (valor >= 50) pulsos = 50;
  else if (valor >= 20) pulsos = 20;
  else if (valor >= 10) pulsos = 10;
  else if (valor >= 5) pulsos = 5;
  else if (valor >= 2) pulsos = 2;

  console.log(`💵 ${nomeMaquina}: +R$ ${valor.toFixed(2)} → ${pulsos} pulsos`);

  // Avisa todos conectados
  avisarTodos({
    tipo: 'pagamento',
    maquina: nomeMaquina,
    valor: valor,
    pulsos: pulsos
  });

  // Envia comando para a caixinha
  if (pulsos > 0) {
    avisarTodos({ comando: 'pulso', quantidade: pulsos, maquina: nomeMaquina });
  }
}

// ========== 🔌 WebSocket ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('✅ Cliente conectou');
  ws.send(JSON.stringify({ tipo: 'dados', maquinas }));

  ws.on('message', (mensagem) => {
    const texto = mensagem.toString();
    console.log('📩', texto);

    if (texto.startsWith('conectado:')) {
      const nome = texto.split(':')[1];
      if (maquinas[nome]) {
        maquinas[nome].online = true;
        maquinas[nome].ultimaAtualizacao = new Date();
        avisarTodos({ tipo: 'status', nome, online: true });
      }
    }

    if (texto.startsWith('adicionar:')) {
      const [_, nome, valor] = texto.split(':');
      processarPagamento(nome, parseFloat(valor));
    }

    if (texto.startsWith('zerar:')) {
      const nome = texto.split(':')[1];
      if (maquinas[nome]) {
        maquinas[nome].faturamento = 0;
        salvarMaquina(nome);
        avisarTodos({ tipo: 'zerar', nome });
      }
    }

    wss.clients.forEach(cliente => {
      if (cliente !== ws && cliente.readyState === WebSocket.OPEN) {
        cliente.send(texto);
      }
    });
  });
});

function avisarTodos(dados) {
  wss.clients.forEach(cliente => {
    if (cliente.readyState === WebSocket.OPEN) {
      cliente.send(JSON.stringify(dados));
    }
  });
}

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
  console.log(`📲 Webhook: /webhook-mercadopago`);
});
