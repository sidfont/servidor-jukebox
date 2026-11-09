#include <WiFi.h>
#include <HTTPClient.h>

// ===== CONFIGURAÇÕES =====
const char* SSID = "brisa-Elaine";
const char* SENHA = "Eloisa250816";
const char* NOME_BOX = "jukebox_01";
const char* SERVIDOR = "https://servidor-jukebox.onrender.com/webhook-esp32";

// PINOS
#define LED_VERMELHO 25
#define LED_VERDE 26
#define LED_AZUL 27
#define PULSO_MAQUINA 23

// ESTADO
bool conectado = false;

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  
  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AZUL, OUTPUT);
  pinMode(PULSO_MAQUINA,OUTPUT);
  
  Serial.println("Jukebox Pix — Iniciando...");
  Serial.println("Conectando ao WiFi...");
  conectaWiFi();
}

// ===== CONECTAR WIFI =====
void conectaWiFi() {
  WiFi.begin(SSID, SENHA);
  int tentativas = 0;
  
  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AZUL, HIGH);
  
  while (WiFi.status() != WL_CONNECTED && tentativas < 60) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_AZUL, !digitalRead(LED_AZUL));
    tentativas++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    conectado = true;
    digitalWrite(LED_AZUL, LOW);
    digitalWrite(LED_VERDE, HIGH);
    Serial.println("\n✅ CONECTADO!");
    Serial.print("📍 IP: "); Serial.println(WiFi.localIP());
    Serial.print("🆔 ID: "); Serial.println(NOME_BOX);
    Serial.println("💰 Valores aceitos: R$2,00 | R$5,00 | R$10,00 | R$20,00 | R$50,00");
    Serial.println("🚀 Pronto! Aguardando pagamentos...");
    avisaServidorOnline();
  } else {
    conectado = false;
    digitalWrite(LED_AZUL, LOW);
    digitalWrite(LED_VERMELHO, HIGH);
    Serial.println("\n❌ FALHA — confere rede e senha");
  }
}

// ===== LOOP PRINCIPAL =====
void loop() {
  static unsigned long ultimaVerificacao = 0;
  const long INTERVALO = 3000; // verifica a cada 3 segundos

  // Reconecta se caiu
  if (WiFi.status() != WL_CONNECTED) {
    if (conectado) {
      Serial.println("⚠️ WiFi perdido. Reconectando...");
      conectado = false;
      digitalWrite(LED_VERDE, LOW);
      digitalWrite(LED_AZUL, HIGH);
    }
    conectaWiFi();
    delay(3000);
    return;
  }

  // Verifica servidor a cada 3 segundos
  if (millis() - ultimaVerificacao >= INTERVALO) {
    ultimaVerificacao = millis();
    verificaComandos();
  }
}

// ===== VERIFICAR COMANDOS DO SERVIDOR =====
void verificaComandos() {
  HTTPClient http;
  String url = String(SERVIDOR) + "?box=" + NOME_BOX;
  
  http.begin(url);
  http.setTimeout(5000); // espera até 5s pela resposta
  
  int codigo = http.GET();
  
  if (codigo == 200) {
    String resposta = http.getString();
    resposta.trim();
    int pulsos = resposta.toInt();
    
    if (pulsos > 0) {
      Serial.print("💵 Recebido: ");
      Serial.print(pulsos);
      Serial.println(" pulsos");
      executaPulsos(pulsos);
    }
  }
  http.end();
}

// ===== EXECUTAR PULSOS NA MÁQUINA =====
void executaPulsos(int quantidade) {
  // Só aceita os valores certos!
  if (quantidade != 2 && quantidade != 5 && quantidade != 10 && 
      quantidade != 20 && quantidade != 50) {
    Serial.println("⚠️ Valor não aceito — ignorado");
    return;
  }
  
  for (int i = 0; i < quantidade; i++) {
    digitalWrite(PULSO_MAQUINA, HIGH);
    delay(80);
    digitalWrite(PULSO_MAQUINA, LOW);
    delay(120);
  }
  Serial.print("✅ ");
  Serial.print(quantidade);
  Serial.println(" pulsos enviados!");
}

// ===== AVISAR SERVIDOR QUE ESTÁ ONLINE =====
void avisaServidorOnline() {
  HTTPClient http;
  String url = "https://servidor-jukebox.onrender.com/online";
  
  http.begin(url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  
  String corpo = "box=" + String(NOME_BOX) + "&ip=" + WiFi.localIP().toString();
  
  int codigo = http.POST(corpo);
  if (codigo == 200) {
    Serial.println("📡 Servidor registrado com sucesso!");
  } else {
    Serial.print("⚠️ Servidor respondeu com código: ");
    Serial.println(codigo);
  }
  http.end();
}
