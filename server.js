const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Lưu trữ dữ liệu
let gameData = {
    currentSession: null,
    currentOdd: null,
    prediction: null,
    history: [],
    predictionHistory: [],
    stats: {
        total: 0,
        win: 0,
        lose: 0,
        accuracy: 0
    }
};

class SmartPredictionEngine {
    constructor() {
        this.consecutiveCrashes = 0;
        this.lastMultiplier = null;
        this.predictionCount = 0;
    }

    analyzeHistory(history) {
        if (history.length < 2) {
            return {
                prediction: 1.8,
                confidence: 20,
                reason: "Cần thêm dữ liệu để phân tích"
            };
        }

        const recent = history.slice(0, 10);
        const odds = recent.map(g => g.ket_qua);
        const lastOdd = odds[0];
        
        // Phân tích đơn giản nhưng hiệu quả
        let prediction = 1.5; // Mặc định thấp để an toàn
        let confidence = 40;
        let reason = "";

        // Pattern 1: Nếu vừa có multiplier cao -> dự đoán thấp
        if (lastOdd > 5.0) {
            prediction = 1.3;
            confidence = 65;
            reason = "Sau multiplier cao " + lastOdd + "x, an toàn với 1.3x";
        }
        // Pattern 2: Nếu liên tiếp crash -> dự đoán cao hơn
        else if (this.consecutiveCrashes >= 2) {
            prediction = 2.0;
            confidence = 55;
            reason = "Sau " + this.consecutiveCrashes + " crash, dự đoán 2.0x";
            this.consecutiveCrashes = 0;
        }
        // Pattern 3: Phân tích trung bình 5 game gần nhất
        else {
            const last5 = odds.slice(0, 5);
            const avg5 = last5.reduce((a, b) => a + b, 0) / last5.length;
            
            if (avg5 < 2.0) {
                prediction = 1.6;
                reason = "Trung bình thấp (" + avg5.toFixed(1) + "x), dự đoán 1.6x";
            } else {
                prediction = 1.4;
                reason = "Trung bình cao, dự đoán thận trọng 1.4x";
            }
            confidence = 45;
        }

        // Cập nhật consecutive crashes
        if (lastOdd < 1.5) {
            this.consecutiveCrashes++;
        } else {
            this.consecutiveCrashes = 0;
        }

        this.lastMultiplier = lastOdd;
        this.predictionCount++;

        return {
            prediction: parseFloat(prediction.toFixed(2)),
            confidence: confidence,
            reason: reason
        };
    }

    updateStats(actualOdd, predictedOdd) {
        const isWin = actualOdd >= predictedOdd;
        
        if (isWin) {
            gameData.stats.win++;
        } else {
            gameData.stats.lose++;
        }
        
        gameData.stats.total = gameData.stats.win + gameData.stats.lose;
        gameData.stats.accuracy = gameData.stats.total > 0 ? 
            Math.round((gameData.stats.win / gameData.stats.total) * 100) : 0;
    }
}

class AviatorGameClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.predictionEngine = new SmartPredictionEngine();
    }

    generateWebSocketKey() {
        return crypto.randomBytes(16).toString('base64');
    }

    connect() {
        const url = 'wss://minybordergs.weskb5gams.net/websocket';
        
        console.log('🚀 Đang kết nối đến WebSocket...');
        
        this.ws = new WebSocket(url, {
            headers: {
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Connection': 'Upgrade',
                'Host': 'minybordergs.weskb5gams.net',
                'Origin': 'https://v.b52.club',
                'Pragma': 'no-cache',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                'Sec-WebSocket-Key': this.generateWebSocketKey(),
                'Sec-WebSocket-Version': '13',
                'Upgrade': 'websocket',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            }
        });

        this.ws.on('open', () => {
            console.log('✅ Kết nối WebSocket thành công!');
            this.isConnected = true;
            this.sendAuthentication();
            
            setTimeout(() => {
                this.sendSubscribe();
            }, 1000);
            
            setTimeout(() => {
                this.sendGetGameData();
            }, 2000);
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                // Bỏ qua lỗi parse
            }
        });

        this.ws.on('error', (error) => {
            console.error('❌ Lỗi kết nối:', error.message);
        });

        this.ws.on('close', () => {
            console.log('🔌 Kết nối đã đóng');
            this.isConnected = false;
            
            setTimeout(() => {
                console.log('🔄 Đang kết nối lại...');
                this.connect();
            }, 5000);
        });
    }

    sendAuthentication() {
        const authMessage = [
            1,
            "MiniGame",
            "",
            "",
            {
                "agentId": "1",
                "accessToken": "13-dea4ae8e5c548cbf1847a97c3dbe94e9",
                "reconnect": false
            }
        ];
        
        this.ws.send(JSON.stringify(authMessage));
    }

    sendSubscribe() {
        const subscribeMessage = [
            "6",
            "MiniGame",
            "aviatorPlugin",
            {
                "cmd": 100000,
                "f": true
            }
        ];
        
        this.ws.send(JSON.stringify(subscribeMessage));
    }

    sendGetGameData() {
        const getGameDataMessage = [
            "6",
            "MiniGame",
            "aviatorPlugin",
            {
                "cmd": 100016
            }
        ];
        
        this.ws.send(JSON.stringify(getGameDataMessage));
        
        const getResultMessage = [
            "6",
            "MiniGame",
            "aviatorPlugin",
            {
                "cmd": 100007
            }
        ];
        
        this.ws.send(JSON.stringify(getResultMessage));
    }

    handleMessage(message) {
        if (Array.isArray(message) && message.length >= 2 && message[0] === 5) {
            const gameDataMsg = message[1];
            
            if (gameDataMsg && gameDataMsg.cmd === 100007) {
                this.updateGameResult(gameDataMsg);
            }
        }
    }

    updateGameResult(gameDataMsg) {
        const sid = gameDataMsg.sid;
        const odd = gameDataMsg.odd;
        const cmd = gameDataMsg.cmd;
        
        if (cmd === 100007 && sid && odd) {
            console.log('📊 Phiên ' + sid + ' : ' + odd + 'x');
            
            // Cập nhật kết quả trước đó nếu có
            if (gameData.prediction && gameData.currentSession) {
                this.predictionEngine.updateStats(odd, gameData.prediction.prediction);
                
                // Lưu vào lịch sử dự đoán
                gameData.predictionHistory.unshift({
                    phien: gameData.currentSession,
                    du_doan: gameData.prediction.prediction,
                    ket_qua: odd,
                    trang_thai: odd >= gameData.prediction.prediction ? 'ĂN' : 'BÚ',
                    thoi_gian: new Date()
                });
                
                // Giới hạn lịch sử
                if (gameData.predictionHistory.length > 50) {
                    gameData.predictionHistory = gameData.predictionHistory.slice(0, 50);
                }
            }
            
            // Cập nhật dữ liệu hiện tại
            gameData.currentSession = sid;
            gameData.currentOdd = odd;
            
            // Thêm vào lịch sử game
            gameData.history.unshift({
                phien: sid,
                ket_qua: odd
            });
            
            // Tạo dự đoán mới
            this.generatePrediction();
            
            // Giới hạn lịch sử
            if (gameData.history.length > 100) {
                gameData.history = gameData.history.slice(0, 100);
            }
        }
    }

    generatePrediction() {
        const prediction = this.predictionEngine.analyzeHistory(gameData.history);
        gameData.prediction = prediction;
        
        console.log('🎯 Dự đoán tiếp theo: ' + prediction.prediction + 'x');
        console.log('📈 Độ tin cậy: ' + prediction.confidence + '%');
        console.log('💡 Lý do: ' + prediction.reason);
        console.log('🍗 Ăn/Bú: ' + gameData.stats.win + '✓/' + gameData.stats.lose + '✗ (' + gameData.stats.accuracy + '%)');
    }

    startPolling(interval = 3000) {
        setInterval(() => {
            if (this.isConnected) {
                const getResultMessage = [
                    "6",
                    "MiniGame",
                    "aviatorPlugin",
                    {
                        "cmd": 100007
                    }
                ];
                this.ws.send(JSON.stringify(getResultMessage));
            }
        }, interval);
    }
}

// Khởi tạo WebSocket client
const gameClient = new AviatorGameClient();
gameClient.connect();

// Bắt đầu polling sau 5 giây
setTimeout(() => {
    gameClient.startPolling(3000);
}, 5000);

// ==================== API ROUTES ====================

// API 1: /api/avitor - Trạng thái hiện tại
app.get('/api', (req, res) => {
    let phien_hien_tai = gameData.currentSession;
    if (phien_hien_tai) {
        phien_hien_tai = (parseInt(phien_hien_tai) + 1).toString();
    }
    
    res.json({
        phien: gameData.currentSession,
        ket_qua: gameData.currentOdd,
        phien_hien_tai: phien_hien_tai,
        du_doan: gameData.prediction ? gameData.prediction.prediction : null,
        li_do: gameData.prediction ? gameData.prediction.reason : "Đang phân tích..."
    });
});

// API 2: /api/history - Lịch sử kết quả
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = gameData.history.slice(0, limit).map(game => ({
        phien: game.phien,
        ket_qua: game.ket_qua
    }));
    
    res.json(history);
});

// API 3: /api/avitor/checkpredict - XEM ĂN ĐƯỢC MẤY TAY
app.get('/api/check', (req, res) => {
    res.json({
        thong_ke: {
            tong_so_tay: gameData.stats.total,
            an_duoc: gameData.stats.win,
            bu_tay: gameData.stats.lose,
            ti_le_an: gameData.stats.accuracy + '%',
            trang_thai: gameData.stats.accuracy >= 50 ? '🔥 ĐANG ĂN NGON' : '💸 CẨN THẬN'
        },
        lich_su_gan_day: gameData.predictionHistory.slice(0, 15),
        du_doan_hien_tai: gameData.prediction ? {
            du_doan: gameData.prediction.prediction + 'x',
            do_tin_cay: gameData.prediction.confidence + '%',
            ly_do: gameData.prediction.reason
        } : null
    });
});

// Khởi động server
app.listen(PORT, () => {
    console.log('🚀 Server API đang chạy trên port ' + PORT);
    console.log('📊 Các endpoints:');
    console.log('   GET  /api           - Trạng thái hiện tại');
    console.log('   GET  /api/history   - Lịch sử kết quả');
    console.log('   GET  /api/check - Xem ăn được mấy tay');
    console.log('');
    console.log('🎯 Truy cập ngay: http://localhost:3000/api/avitor/checkpredict');
});
