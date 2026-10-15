const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));
// Banco de dados único que gerencia todas as caixas
const db = new Datastore({ filename: 'faturamento_geral.db', autoload: true });

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

function enviarSinalBlynk(pino, valor) {
    const url = "https://blynk.cloud" + BLYNK_TOKEN + "&" + pino + "=" + valor;
    axios.get(url).catch(() => {});
}

// CONSULTA O FATURAMENTO DA MÁQUINA SELECIONADA
app.get('/api/faturamento', (req, res) => {
    const idMaquina = req.query.maquina || "Box-01";
    db.findOne({ maquina: idMaquina }, (err, doc) => {
        res.json({ maquina: idMaquina, totalAcumulado: doc ? doc.totalAcumulado : 0 });
    });
});

// ZERA O CONTADOR APENAS DA MÁQUINA SOLICITADA
app.post('/api/zerar-caixa', (req, res) => {
    const idMaquina = req.body.maquina || "Box-01";
    db.update({ maquina: idMaquina }, { $set: { totalAcumulado: 0 } }, { upsert: true }, () => {
        res.json({ success: true });
    });
});

// CLIQUE MANUAL DO PAINEL ESCURO
app.post('/api/simular-pix', async (req, res) => {
    const idMaquina = req.body.maquina || "Box-01";
    const { valor } = req.body;
    console.log("[PAINEL MULTI] Comando recebido para a " + idMaquina + ": R$ " + valor);
    
    try {
        const pulsosParaEnviar = obterQuantidadePulsos(parseFloat(valor));
        res.json({ success: true }); 

        if (pulsosParaEnviar > 0) {
            db.update({ maquina: idMaquina }, { $inc: { totalAcumulado: parseFloat(valor) } }, { upsert: true });
            
            // Roda os pulsos compassados de ontem
            for (let i = 1; i <= pulsosParaEnviar; i++) {
                console.log("-> " + idMaquina + " | Pulso " + i + " de " + pulsosParaEnviar);
                enviarSinalBlynk("V1", "1");
                await new Promise(r => setTimeout(r, 450));
                enviarSinalBlynk("V1", "0");
                await new Promise(r => setTimeout(r, 450));
            }
        }
    } catch (erro) {
        console.log("Erro no laco de pulsos:", erro.message);
    }
});

// WEBHOOK GERAL DO MERCADO PAGO
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
                
                // Padrão do webhook para a Box-01 na rua
                const idMaquina = "Box-01"; 

                if (pulsosParaEnviar > 0) {
                    db.update({ maquina: idMaquina }, { $inc: { totalAcumulado: valorPixReal } }, { upsert: true });
                    
                    for (let i = 1; i <= pulsosParaEnviar; i++) {
                        enviarSinalBlynk("V1", "1");
                        await new Promise(r => setTimeout(r, 450));
                        enviarSinalBlynk("V1", "0");
                        await new Promise(r => setTimeout(r, 450));
                    }
                }
            }
        } catch (erro) {}
    }
});

app.listen(3000, () => {
    console.log('Servidor Multi-Maquinas Ativo!');
});

