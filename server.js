const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORTA = process.env.PORT || 3000;

// Configurações
app.use(cors());
app.use(bodyParser.json());

// ✅ Página de teste
app.get('/', (req, res) => {
    res.send('✅ Jukebox Pix — Servidor funcionando perfeitamente!');
});

// 🔑 Webhook — o PagBank avisa aqui quando alguém paga
app.post('/api/webhook-pagbank', (req, res) => {
    try {
        console.log('📩 Pagamento recebido do PagBank:');
        console.log(JSON.stringify(req.body, null, 2));
        
        // Aqui vamos processar o pagamento depois
        res.status(200).json({ 
            ok: true, 
            mensagem: '✅ Aviso de pagamento recebido com sucesso!' 
        });
    } catch (erro) {
        console.error('❌ Erro ao processar webhook:', erro);
        res.status(500).json({ 
            ok: false, 
            erro: 'Erro interno no servidor' 
        });
    }
});

// Iniciar servidor
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando na porta ${PORTA}`);
    console.log(`📍 Acesso principal: pronto e funcionando`);
    console.log(`🔑 Webhook pronto: /api/webhook-pagbank`);
});
