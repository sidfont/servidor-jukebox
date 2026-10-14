const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Datastore = require('nedb');

const app = express();
app.use(express.json());
app.use(cors());

const db = new Datastore({ filename: 'faturamento.db', autoload: true });

const MAQUINA_ID = "Box 05 Teste"; 
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

// FUNÇÃO TOTALMENTE BLINDADA CONTRA TRADUTORES DE NAVEGADOR
async function enviarSinalBlynk(pino, valor) {
    const blynkHost = "https://blynk.cloud";
    const blynkPath = "/external/api/update?token=";
    const urlCompleta = blynkHost + blynkPath + BLYNK_TOKEN + "&" + pino + "=" + valor;
    await axios.get(urlCompleta).catch(() => {});
}

async function inicializarLuzesStatus() {
    console.log("-> Configurando LEDs de status no Blynk...");
    await enviarSinalBlynk("V26", "1"); // Verde Online LIGA
    await enviarSinalBlynk("V27", "0"); // Azul Offline DESLIGA
    await enviarSinalBlynk("V25", "0"); // Vermelho Pulso DESLIGA
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

// LINK DIRETO DOS BOTÕES AZUIS DO PAINEL PARA O PINO V1
app.post('/api/simular-pix', async (req, res) => {
    const { valor } = req.body;
    console.log("[PAINEL TESTE] Recebido clique manual de R$ " + valor);
    
    try {
        const pulsosParaEnviar = obterQuantidadePulsos(parseFloat(valor));
        if (pulsosParaEnviar > 0) {
            db.findOne({ maquina: MAQUINA_ID }, async (err, doc) => {
                const atual = doc ? doc.totalAcumulado : 0;
                const novoValor = Math.round((atual + parseFloat(valor)) * 100) / 100;
                db.update({ maquina: MAQUINA_ID }, { m: MAQUINA_ID, totalAcumulado: novoValor }, { upsert: true });
                
                // DISPARA DIRETAMENTE O VALOR CORRETO PARA O BLYNK
                await enviarSinalBlynk("V1", pulsosParaEnviar);
            });
        }
        res.json({ success: true });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); 

    const { action, type, data } = req.body;
    console.log("[WEBHOOK] Notificacao recebida do banco.");

    if (type === 'payment' || action === 'payment.created' || req.body.topic === 'payment') {
        const idPagamento = data && data.id ? data.id : req.body.id;
        
        if (!idPagamento) {
            console.log("-> ID do pagamento nao encontrado na mensagem.");
            return;
        }

        console.log("-> ID do Pix detectado: " + idPagamento + ". Consultando valores no Mercado Pago...");

        try {
            const mpUrl1 = "https://mercadopago.com";
            const mpUrl2 = "/v1/payments/";
            const urlConsulta = mpUrl1 + mpUrl2 + idPagamento;

            const respostaMP = await axios.get(urlConsulta, {
                headers: { 'Authorization': "Bearer " + MP_ACCESS_TOKEN }
            });

            if (respostaMP.data && respostaMP.data.status === 'approved') {
                const valorPixReal = parseFloat(respostaMP.data.transaction_amount);
                const pulsosParaEnviar = obterQuantidadePulsos(valorPixReal);

                console.log("\n=== PIX REAL APROVADO ===");

                if (pulsosParaEnviar > 0) {
                    db.findOne({ maquina: MAQUINA_ID }, async (err, doc) => {
                        const atual = doc ? doc.totalAcumulado : 0;
                        const novoValor = Math.round((atual + valorPixReal) * 100) / 100;
                        db.update({ maquina: MAQUINA_ID }, { m: MAQUINA_ID, totalAcumulado: novoValor }, { upsert: true });
                        console.log("-> Despachando " + pulsosParaEnviar + " creditos para a Box...");
                        await enviarSinalBlynk("V1", pulsosParaEnviar);
                    });
                } else {
                    console.log("-> O valor recebido nao atinge o minimo.");
                }
            } else {
                console.log("-> Status do pagamento ainda nao esta aprovado.");
            }
        } catch (erro) {
            console.log("-> Erro ao consultar pagamento no Mercado Pago:", erro.message);
        }
    }
});

app.use((req, res) => { res.status(404).send("Rota nao encontrada"); });

app.listen(3000, async () => {
    console.log('Servidor Jukebox de Producao Ativo na porta 3000!');
    await inicializarLuzesStatus();
});
