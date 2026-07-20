// Client-facing shapes for the predictions API (kept dependency-light so
// client components can import them without pulling in DB code).

export interface PredictionDto {
  id: number;
  symbol: string;
  createdAt: number;
  outlook: "bullish" | "neutral" | "bearish";
  confidence: number;
  horizonDays: number;
  thesis: string;
  risks: string[];
  catalysts: string[];
  sources: Array<{ title: string; url: string }>;
  model: string | null;
  status: "ok" | "error";
  algoVersion: number | null;
  regime: string | null;
}

export interface OutcomeDto {
  predictionId: number;
  evaluatedAt: number;
  priceAtPrediction: number;
  priceAtHorizon: number;
  returnPct: number;
  directionCorrect: boolean;
  neutralBandPct: number | null;
  benchmarkReturnPct: number | null;
}

export interface CalibrationDto {
  effective: number;
  capped: boolean;
  segment: { samples: number; winRate: number | null };
}

export interface PredictionListItem {
  symbol: string;
  prediction: PredictionDto | null;
  calibration: CalibrationDto | null;
  outcome: OutcomeDto | null;
}

export interface AccuracyDto {
  graded: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgExcessVsSpyPct: number | null;
  byOutlook: Array<{ label: string; samples: number; winRate: number }>;
  byConfidence: Array<{ label: string; samples: number; winRate: number }>;
  byVersion: Array<{ label: string; samples: number; winRate: number }>;
  byRegime: Array<{ label: string; samples: number; winRate: number }>;
  baselines: {
    alwaysBullishWinRate: number | null;
    momentumWinRate: number | null;
  };
}
