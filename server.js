const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());

const db = new Datastore({ filename: 'faturamento.db', autoload: true });

const MAQUINA_ID = "Box-01"; 
const BLYNK_TOKEN = "ASLzBlIjoi4Q2Vo-HVD-LiuYj1Msr4gM"; 
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function obterQuantidadePulsos(valor) {
    if (valor >= 50) return 50;
    if (valor >= 20) return 20;
    if (valor >= 10) return 10;
    if (valor >= 5) return 5;
    if (valor >= 2) return 2;
    return 0; 
}

async function enviarSinalBlynk(pino, valor) {
    const url = "https://blynk.cloud" + BLYNK_TOKEN + "&" + pino + "=" + valor;
    await axios.get(url).catch(() => {});
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
    console.log("[PAINEL TESTE] Clique manual para a Box-01: R$ " + valor);
    
    try {
        const pulsosParaEnviar = obterQuantidadePulsos(parseFloat(valor));
        res.json({ success: true }); // Responde rápido o painel

        if (pulsosParaEnviar > 0) {
            db.update({ maquina: MAQUINA_ID }, { $inc: { totalAcumulado: parseFloat(valor) } }, { upsert: true });
            
            // RODA O RITMO DE PULSOS CORTADOS IGUAL ONTEM (EVITA DAR 100 PULSOS)
            for (let i = 1; i <= pulsosParaEnviar; i++) {
                console.log("Soltando pulso " + i + " de " + pulsosParaEnviar);
                await enviarSinalBlynk("V1", "1");
                await new Promise(r => setTimeout(r, 400));
                await enviarSinalBlynk("V1", "0");
                await new Promise(r => setTimeout(r, 400));
            }
        }
    } catch (erro) {
        console.log("Erro no laco de pulsos:", erro.message);
    }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); 
    const { action, type, data } = req.body;

    if (type === 'payment' || action === 'payment.created') {
        const idPagamento = data && data.id ? data.id : req.body.id;
        if (!idPagamento) return;

        try {
            const urlConsulta = "https://mercadopago.com" + idPagamento;
            const respostaMP = await axios.get(urlConsulta, {
                headers: { 'Authorization': "Bearer " + MP_ACCESS_TOKEN }
            });

            if (respostaMP.data && respostaMP.data.status === 'approved') {
                const valorPixReal = parseFloat(respostaMP.data.transaction_amount);
                const pulsosParaEnviar = obterQuantidadePulsos(valorPixReal);

                if (pulsosParaEnviar > 0) {
                    db.update({ maquina: MAQUINA_ID }, { $inc: { totalAcumulado: valorPixReal } }, { upsert: true });
                    
                    for (let i = 1; i <= pulsosParaEnviar; i++) {
                        await enviarSinalBlynk("V1", "1");
                        await new Promise(r => setTimeout(r, 400));
                        await enviarSinalBlynk("V1", "0");
                        await new Promise(r => setTimeout(r, 400));
                    }
                }
            }
        } catch (erro) {}
    }
});

app.listen(3000, () => {
    console.log('Servidor da Box-01 Ativo em Producao!');
});
