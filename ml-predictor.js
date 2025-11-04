// 🤖 MACHINE LEARNING ENHANCED PREDICTOR
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs').promises;

class MLPredictor {
  constructor() {
    this.model = null;
    this.scaler = null;
    this.isTraining = false;
  }

  // STEP 1: Preparazione dati per ML
  prepareFeatures(homeStats, awayStats, h2h, homeForm, awayForm, marketOdds = null) {
    return [
      // Performance stagionale (8 features)
      homeStats.avgGoalsFor || 0,
      homeStats.avgGoalsAgainst || 0,
      awayStats.avgGoalsFor || 0,
      awayStats.avgGoalsAgainst || 0,
      homeStats.winRate || 0,
      homeStats.drawRate || 0,
      awayStats.winRate || 0,
      awayStats.drawRate || 0,

      // Head-to-Head (4 features)
      h2h.homeWinRate || 0.33,
      h2h.drawRate || 0.33,
      h2h.awayWinRate || 0.33,
      h2h.avgHomeGoals || 1.2,

      // Forma recente (6 features)
      homeForm.avgPoints || 1.0,
      homeForm.momentum || 0,
      awayForm.avgPoints || 1.0,
      awayForm.momentum || 0,
      homeForm.avgGoalsFor || 1.0,
      awayForm.avgGoalsFor || 1.0,

      // Context features (4 features)
      1, // home advantage (sempre 1)
      homeStats.matches || 10,
      awayStats.matches || 10,
      h2h.matches || 0,

      // Market sentiment (3 features) - opzionale
      marketOdds?.home || 2.5,
      marketOdds?.draw || 3.2,
      marketOdds?.away || 3.0
    ];
  }

  // STEP 2: Modello Neural Network
  createModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [25], // 25 features
          units: 128,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 5, // [homeGoals, awayGoals, prob1, probX, prob2]
          activation: 'linear'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  // STEP 3: Training del modello
  async trainModel(trainingData) {
    console.log('🤖 Inizio training del modello ML...');
    
    if (trainingData.length < 100) {
      console.log('⚠️ Dati insufficienti per training (minimo 100 match)');
      return false;
    }

    // Prepara dataset
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.target);

    const xs = tf.tensor2d(X);
    const ys = tf.tensor2d(y);

    // Normalizzazione
    const xsMean = xs.mean(0);
    const xsStd = xs.sub(xsMean).square().mean(0).sqrt();
    const xsNormalized = xs.sub(xsMean).div(xsStd.add(tf.scalar(1e-8)));

    // Crea e allena modello
    this.model = this.createModel();
    this.scaler = { mean: xsMean, std: xsStd };

    const history = await this.model.fit(xsNormalized, ys, {
      epochs: 200,
      batchSize: 32,
      validationSplit: 0.2,
      verbose: 1,
      callbacks: tf.callbacks.earlyStopping({ patience: 20 })
    });

    console.log('✅ Training completato!');
    return true;
  }

  // STEP 4: Predizione ML
  async predict(features) {
    if (!this.model || !this.scaler) {
      console.log('⚠️ Modello non trainato, uso predizione classica');
      return null;
    }

    const inputTensor = tf.tensor2d([features]);
    const normalizedInput = inputTensor
      .sub(this.scaler.mean)
      .div(this.scaler.std.add(tf.scalar(1e-8)));

    const prediction = this.model.predict(normalizedInput);
    const result = await prediction.data();

    return {
      homeGoals: Math.max(0.1, result[0]),
      awayGoals: Math.max(0.1, result[1]),
      prob1: Math.max(0.01, Math.min(0.99, result[2])),
      probX: Math.max(0.01, Math.min(0.99, result[3])),
      prob2: Math.max(0.01, Math.min(0.99, result[4]))
    };
  }

  // STEP 5: Salvataggio/Caricamento modello
  async saveModel(path = './models/calcio-pred-ml') {
    if (this.model) {
      await this.model.save(`file://${path}`);
      await fs.writeFile(`${path}/scaler.json`, JSON.stringify({
        mean: await this.scaler.mean.data(),
        std: await this.scaler.std.data()
      }));
      console.log('💾 Modello salvato');
    }
  }

  async loadModel(path = './models/calcio-pred-ml') {
    try {
      this.model = await tf.loadLayersModel(`file://${path}/model.json`);
      const scalerData = JSON.parse(await fs.readFile(`${path}/scaler.json`, 'utf8'));
      this.scaler = {
        mean: tf.tensor(scalerData.mean),
        std: tf.tensor(scalerData.std)
      };
      console.log('✅ Modello ML caricato');
      return true;
    } catch (error) {
      console.log('⚠️ Modello ML non trovato, uso predizione classica');
      return false;
    }
  }
}

// STEP 6: Sistema ibrido ML + Algoritmo classico
class HybridPredictor extends require('./enhanced-predictor') {
  constructor() {
    super();
    this.mlPredictor = new MLPredictor();
    this.hybridWeight = 0.7; // 70% ML, 30% classico quando ML è disponibile
  }

  async initialize() {
    const mlLoaded = await this.mlPredictor.loadModel();
    if (!mlLoaded) {
      console.log('🎯 Modalità SOLO algoritmo classico');
      this.hybridWeight = 0;
    } else {
      console.log('🤖 Modalità IBRIDA: ML + Algoritmo classico');
    }
  }

  async calculateHybridPrediction(homeTeamId, awayTeamId, leagueId, season, marketOdds = null) {
    // 1. Predizione classica (sempre disponibile)
    const classicPred = await this.calculateEnhancedPrediction(homeTeamId, awayTeamId, leagueId, season);

    // 2. Predizione ML (se disponibile)
    let mlPred = null;
    if (this.mlPredictor.model) {
      const features = this.prepareMLFeatures(classicPred, marketOdds);
      mlPred = await this.mlPredictor.predict(features);
    }

    // 3. Blending intelligente
    if (mlPred && this.hybridWeight > 0) {
      return this.blendPredictions(classicPred, mlPred, this.hybridWeight);
    }

    return classicPred;
  }

  prepareMLFeatures(classicPred, marketOdds) {
    // Estrae features dal classic prediction per il ML
    const homeStats = classicPred.homeForm;
    const awayStats = classicPred.awayForm;
    const h2h = classicPred.h2h;

    return this.mlPredictor.prepareFeatures(
      {
        avgGoalsFor: homeStats.avgGoalsFor,
        avgGoalsAgainst: homeStats.avgGoalsAgainst,
        winRate: homeStats.avgPoints / 3,
        drawRate: 0.25, // stima
        matches: homeStats.matches
      },
      {
        avgGoalsFor: awayStats.avgGoalsFor,
        avgGoalsAgainst: awayStats.avgGoalsAgainst,
        winRate: awayStats.avgPoints / 3,
        drawRate: 0.25, // stima
        matches: awayStats.matches
      },
      h2h,
      homeStats,
      awayStats,
      marketOdds
    );
  }

  blendPredictions(classic, ml, weight) {
    const mlWeight = weight;
    const classicWeight = 1 - weight;

    return {
      ...classic,
      homeGoals: (classic.homeGoals * classicWeight) + (ml.homeGoals * mlWeight),
      awayGoals: (classic.awayGoals * classicWeight) + (ml.awayGoals * mlWeight),
      prob1X2: {
        prob1: (classic.prob1X2.prob1 * classicWeight) + (ml.prob1 * mlWeight),
        probX: (classic.prob1X2.probX * classicWeight) + (ml.probX * mlWeight),
        prob2: (classic.prob1X2.prob2 * classicWeight) + (ml.prob2 * mlWeight)
      },
      mlContribution: mlWeight,
      classicContribution: classicWeight
    };
  }
}

module.exports = { MLPredictor, HybridPredictor };