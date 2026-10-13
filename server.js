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

function obterQuantidadePulsos(valor) {
    if (valor >= 50) return 50;
    if (valor >= 20) return 20;
    if (valor >= 10) return 10;
    if (valor >= 5) return 5;
    if (valor >= 2) return 2;
    return 0; 
}

// FUNÇÃO AUXILIAR PARA ATUALIZAR STATUS NO BLYNK
async function enviarSinalBlynk(pino, valor) {
    const url = "https://blynk.cloud" + BLYNK_TOKEN + "&" + pino + "=" + valor;
    await axios.get(url).catch(() => {});
}

// INICIALIZA AS LUZES DO SISTEMA (Acende Online=1 e apaga Offline=0)
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
                    
                    // ACENDE O LED VERMELHO DE PULSO (V25=1) E LIGA O RELÉ DA MÁQUINA (V1=1)
                    await enviarSinalBlynk("V25", "1");
                    await enviarSinalBlynk("V1", "1");
                    await new Promise(r => setTimeout(r, 500)); 
                    
                    // APAGA O LED VERMELHO DE PULSO (V25=0) E DESLIGA O RELÉ DA MÁQUINA (V1=0)
                    await enviarSinalBlynk("V25", "0");
                    await enviarSinalBlynk("V1", "0");
                    await new Promise(r => setTimeout(r, 500)); 
                }
                console.log("=== Creditos entregues com sucesso! ===\n");
            }
        }
    } catch (erro) {
        console.log("Erro webhook:", erro.message);
        // Se houver falha crítica, aciona sinal de falha física
        await enviarSinalBlynk("V26", "0"); // Desliga Verde
        await enviarSinalBlynk("V27", "1"); // Acende Azul Offline
    }
});

app.listen(3000, async () => {
    console.log('Servidor Jukebox Ativo na porta 3000!');
    // Executa a configuração inicial de luzes assim que o Render liga
    await inicializarLuzesStatus();
});
