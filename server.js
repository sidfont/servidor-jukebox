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
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; // Puxa a credencial que salvamos no Render

function obterQuantidadePulsos(valor) {
    if (valor >= 50) return 50;
    if (valor >= 20) return 20;
    if (valor >= 10) return 10;
    if (valor >= 5) return 5;
    if (valor >= 2) return 2;
    return 0; 
}

async function enviarSinalBlynk(pino, valor) {
    const urlParte1 = "https://blynk.cloud";
    const urlParte2 = "/external/api/update?token=";
    const url = urlParte1 + urlParte2 + BLYNK_TOKEN + "&" + pino + "=" + valor;
    await axios.get(url).catch(() => {});
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
    db.update({ maquina: MAQUINA_ID }, { \$set: { totalAcumulado: 0 } }, { upsert: true }, () => {
        res.json({ success: true });
    });
});

// MANTÉM O SUPORTE PARA OS SEUS BOTÕES AZUIS DE TESTE FUNCIONAREM TAMBÉM
app.post('/api/simular-pix', async (req, res) => {
    const { valor } = req.body;
    console.log("[PAINEL TESTE] Recebido clique manual de R\$ " + valor);
    
    try {
        const pulsosParaEnviar = obterQuantidadePulsos(parseFloat(valor));
        if (pulsosParaEnviar > 0) {
            db.update({ maquina: MAQUINA_ID }, { \$inc: { totalAcumulado: parseFloat(valor) } }, { upsert: true });
            await enviarSinalBlynk("V1", pulsosParaEnviar);
        }
        res.json({ success: true });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// WEBHOOK PROFISSIONAL: TRATA A NOTIFICAÇÃO REAL DO MERCADO PAGO
app.post('/webhook', async (req, res) => {
    // Responde 200 imediatamente para o Mercado Pago não travar a fila
    res.sendStatus(200); 

    const { action, type, data } = req.body;
    console.log(`[WEBHOOK] Notificação recebida do banco. Tipo: ${type || req.body.topic}, Ação: ${action}`);

    // Identifica se a notificação é de um pagamento criado ou aprovado
    if (type === 'payment' || action === 'payment.created' || req.body.topic === 'payment') {
        const idPagamento = data && data.id ? data.id : req.body.id;
        
        if (!idPagamento) {
            console.log("-> ID do pagamento não encontrado na mensagem.");
            return;
        }

        console.log("-> ID do Pix detectado: " + idPagamento + ". Consultando valores no Mercado Pago...");

        try {
            // Consulta os detalhes reais do pagamento direto na API do Mercado Pago
            const urlConsulta = `https://mercadopago.com{idPagamento}`;
            const respostaMP = await axios.get(urlConsulta, {
                headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
            });

            // Verifica se o Pix foi aprovado de verdade pelo banco
            if (respostaMP.data && respostaMP.data.status === 'approved') {
                const valorPixReal = parseFloat(respostaMP.data.transaction_amount);
                const pulsosParaEnviar = obterQuantidadePulsos(valorPixReal);

                console.log(`\n=== PIX REAL APROVADO: R$ ${valorPixReal.toFixed(2)} ===`);

                if (pulsosParaEnviar > 0) {
                    db.update({ maquina: MAQUINA_ID }, { \$inc: { totalAcumulado: valorPixReal } }, { upsert: true });
                    console.log("-> Despachando " + pulsosParaEnviar + " créditos para a Box...");
                    
                    // Envia o valor total de uma vez só para a placa ESP32 estalar com precisão
                    await enviarSinalBlynk("V1", pulsosParaEnviar);
                    console.log("=== Créditos entregues na Jukebox! ===\n");
                } else {
                    console.log("-> O valor recebido não atinge o mínimo para gerar créditos.");
                }
            } else {
                console.log("-> Status do pagamento ainda não está aprovado: " + (respostaMP.data ? respostaMP.data.status : 'desconhecido'));
            }
        } catch (erro) {
            console.log("-> Erro ao consultar pagamento no Mercado Pago:", erro.message);
        }
    }
});

app.listen(3000, async () => {
    console.log('Servidor Jukebox de Produção Ativo na porta 3000!');
    await inicializarLuzesStatus();
});
