const express = require('express');
const app = express();
const porta = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Token do PagBank (pegado das variáveis de ambiente)
const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN || '';

// Armazena os pulsos pendentes
let pulsos = [];

// Rota de teste
app.get('/', (req, res) => {
  res.send('✅ Servidor Jukebox está funcionando!');
});

// Rota para criar cobrança Pix
app.post('/criar-pix', async (req, res) => {
  try {
    const { valor, descricao = 'Jukebox Brasil' } = req.body;
    
    if (!PAGBANK_TOKEN) {
      return res.status(500).json({ erro: 'Token do PagBank não configurado' });
    }

    const resposta = await fetch('https://sandbox.api.pagseguro.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reference_id: `jukebox-${Date.now()}`,
        description: descricao,
        amount: {
          value: Math.round(valor * 100),
          currency: 'BRL'
        },
        payment: {
          methods: ['pix'],
          pix: {
            expiration: 3600
          }
        }
      })
    });

    const dados = await resposta.json();
    
    if (dados.links && dados.links.length > 0) {
      const qrcodePix = dados.links.find(l => l.media === 'image/png');
      const codigoPix = dados.payment_response?.pix_copy_and_paste;
      
      pulsos.push({
        id: dados.id,
        valor: valor,
        pago: false,
        criadoEm: new Date()
      });
      
      return res.json({
        sucesso: true,
        id: dados.id,
        valor: valor,
        qrcodeUrl: qrcodePix?.href,
        codigoPix: codigoPix,
        status: dados.status
      });
    }
    
    res.json({ sucesso: true, dados: dados });
  } catch (erro) {
    console.error('Erro ao criar Pix:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// Rota para o ESP32 verificar se tem pulso
app.get('/verificar-pulso', (req, res) => {
  const pendente = pulsos.find(p => !p.pago);
  if (pendente) {
    pendente.pago = true;
    res.json({ temPulso: true, valor: pendente.valor });
  } else {
    res.json({ temPulso: false });
  }
});

// Rota do Webhook (onde o PagBank avisa que foi pago)
app.post('/webhook-pix', (req, res) => {
  console.log('📩 Notificação recebida:', req.body);
  res.sendStatus(200);
});

// Inicia o servidor
app.listen(porta, () => {
  console.log(`🚀 Servidor rodando na porta ${porta}`);
});

