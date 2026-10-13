const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());

const db = new Datastore({ filename: 'faturamento.db', autoload: true });

const MAQUINA_ID = "Box 05 Teste"; 
const BLYNK_TOKEN = "ASLsOlIjoiQ2Vu-MVD-LIuYjJVnR4gM"; 

function obterQuantidadePulsos(valor) {
    if (valor >= 50) return 50;
    if (valor >= 20) return 20;
    if (valor >= 10) return 10;
    if (valor >= 5) return 5;
    if (valor >= 2) return 2;
    return 0; 
}

app.get('/api/faturamento', (req, res) => {
    db.findOne({ maquina: MAQUINA_ID }, (err, doc) => {
        res.json({ maquina: MAQUINA_ID, totalAcumulado: doc ? doc.totalAcumulado : 0 });
    });
});

app.post('/api/zerar-caixa', (req, res) => {
    db.update({ maquina: MAQUINA_ID }, { $set: { totalAcumulado: 0 } }, { upsert: true }, () => {
        res.json({ success: true });
    });
});

app.post('/api/simular-pix', async (req, res) => {
    const { valor } = req.body;
    console.log("[SIMULADOR] Recebido clique de R$ " + valor);
    
    const notificacaoSimulada = {
        type: 'payment',
        action: 'payment.created',
        data: { id: "TESTE-" + Date.now(), transaction_amount: parseFloat(valor) }
    };

    try {
        await axios.post('http://localhost:3000/webhook', notificacaoSimulada);
        res.json({ success: true });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); 
    try {
        const notificacao = req.body;
        if (notificacao && (notificacao.type === 'payment' || notificacao.action === 'payment.created')) {
            const valorPix = notificacao.data && notificacao.data.transaction_amount ? parseFloat(notificacao.data.transaction_amount) : 2.00;
            const pulsosParaEnviar = obterQuantidadePulsos(valorPix);

            if (pulsosParaEnviar > 0) {
                console.log("\n=== ACUMULANDO NO BANCO: R$ " + valorPix.toFixed(2) + " ===");
                
                db.update({ maquina: MAQUINA_ID }, { $inc: { totalAcumulado: valorPix } }, { upsert: true });

                console.log("-> Disparando " + pulsosParaEnviar + " pulsos para a Box Jukebox...");
                for (let i = 1; i <= pulsosParaEnviar; i++) {
                    console.log("Pulso " + i + " de " + pulsosParaEnviar);
                    
                    const urlParte1 = "https://blynk.cloud";
                    const urlParte2 = "/external/api/update?token=";
                    
                    const linkLiga = urlParte1 + urlParte2 + "ASLzBlIjoi4Q2Vo-HVD-LiuYjlMsr4gM" + "&V1=1";
                    const linkDesliga = urlParte1 + urlParte2 + "ASLzBlIjoi4Q2Vo-HVD-LiuYjlMsr4gM" + "&V1=0";

                    await axios.get(linkLiga).catch(()=>{});
                    await new Promise(r => setTimeout(r, 300)); 
                    
                    await axios.get(linkDesliga).catch(()=>{});
                    await new Promise(r => setTimeout(r, 300)); 
                }
                console.log("=== Creditos entregues com sucesso! ===\n");
            }
        }
    } catch (erro) {
        console.log("Erro webhook:", erro.message);
    }
});

app.listen(3000, () => console.log('Servidor Jukebox Ativo na porta 3000!'));
