"""
Deep Learning Service using PyTorch
Supports: Neural Network Classifier, Regressor, LSTM Forecasting
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional
import json

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, TensorDataset
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

from services.ml_service import MLService


if TORCH_AVAILABLE:
    # ── Neural Network Architectures ──────────────────────────────────

    class TabularClassifier(nn.Module):
        """Feed-forward NN for tabular classification"""
        def __init__(self, input_dim: int, hidden_dims: List[int], n_classes: int, dropout: float = 0.3):
            super().__init__()
            layers = []
            prev_dim = input_dim
            for dim in hidden_dims:
                layers.extend([nn.Linear(prev_dim, dim), nn.BatchNorm1d(dim),
                               nn.ReLU(), nn.Dropout(dropout)])
                prev_dim = dim
            layers.append(nn.Linear(prev_dim, n_classes))
            self.net = nn.Sequential(*layers)

        def forward(self, x):
            return self.net(x)


    class TabularRegressor(nn.Module):
        """Feed-forward NN for tabular regression"""
        def __init__(self, input_dim: int, hidden_dims: List[int], dropout: float = 0.3):
            super().__init__()
            layers = []
            prev_dim = input_dim
            for dim in hidden_dims:
                layers.extend([nn.Linear(prev_dim, dim), nn.BatchNorm1d(dim),
                               nn.ReLU(), nn.Dropout(dropout)])
                prev_dim = dim
            layers.append(nn.Linear(prev_dim, 1))
            self.net = nn.Sequential(*layers)

        def forward(self, x):
            return self.net(x).squeeze(-1)


    class LSTMForecaster(nn.Module):
        """LSTM for time series forecasting"""
        def __init__(self, input_dim: int = 1, hidden_dim: int = 64,
                     n_layers: int = 2, dropout: float = 0.2):
            super().__init__()
            self.lstm = nn.LSTM(input_dim, hidden_dim, n_layers,
                                batch_first=True, dropout=dropout)
            self.fc = nn.Linear(hidden_dim, 1)

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.fc(out[:, -1, :]).squeeze(-1)


class DLService:

    @staticmethod
    def _get_device():
        if not TORCH_AVAILABLE:
            return None
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @staticmethod
    async def train_neural_classifier(
        df: pd.DataFrame,
        experiment_id: str,
        target_col: str,
        feature_cols: List[str],
        hidden_dims: List[int] = None,
        epochs: int = 50,
        lr: float = 0.001,
        batch_size: int = 256,
        dropout: float = 0.3,
        progress_callback=None
    ) -> Dict[str, Any]:
        if not TORCH_AVAILABLE:
            raise ImportError("PyTorch not installed. Run: pip install torch")

        if hidden_dims is None:
            hidden_dims = [256, 128, 64]

        device = DLService._get_device()

        # Load + preprocess same as traditional ML
        if progress_callback: await progress_callback(5, "Loading data...")
        df = await MLService.load_dataset(df)
        X, y, meta = MLService.preprocess(df, target_col, feature_cols, 'classification')

        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Convert to tensors
        X_tr = torch.FloatTensor(X_train).to(device)
        y_tr = torch.LongTensor(y_train).to(device)
        X_te = torch.FloatTensor(X_test).to(device)
        y_te = torch.LongTensor(y_test).to(device)

        train_ds = TensorDataset(X_tr, y_tr)
        train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True)

        n_classes = len(meta.get('classes', []))
        model = TabularClassifier(X_train.shape[1], hidden_dims, n_classes, dropout).to(device)
        optimizer = optim.AdamW(model.parameters(), lr=lr)
        criterion = nn.CrossEntropyLoss()
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)

        history = {'train_loss': [], 'val_accuracy': []}

        if progress_callback: await progress_callback(10, "Training neural network...")

        for epoch in range(epochs):
            model.train()
            for xb, yb in train_dl:
                optimizer.zero_grad()
                criterion(model(xb), yb).backward()
                optimizer.step()
            scheduler.step()

            if (epoch + 1) % max(1, epochs // 10) == 0:
                model.eval()
                with torch.no_grad():
                    logits = model(X_te)
                    preds = logits.argmax(dim=1).cpu().numpy()
                    acc = float((preds == y_test).mean())
                    history['val_accuracy'].append({'epoch': epoch + 1, 'accuracy': round(acc, 4)})

                progress = 10 + int((epoch / epochs) * 80)
                if progress_callback:
                    await progress_callback(progress, f"Epoch {epoch+1}/{epochs} — val_acc: {acc:.3f}")

        # Final evaluation
        model.eval()
        with torch.no_grad():
            preds = model(X_te).argmax(dim=1).cpu().numpy()

        from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
        metrics = {
            'accuracy': round(float(accuracy_score(y_test, preds)), 4),
            'f1_weighted': round(float(f1_score(y_test, preds, average='weighted')), 4),
            'epochs': epochs,
            'architecture': hidden_dims,
        }

        if progress_callback: await progress_callback(100, "Training complete!")

        return {
            'metrics': metrics,
            'history': history,
            'confusion_matrix': confusion_matrix(y_test, preds).tolist(),
            'model_type': 'neural_network',
            'architecture': {
                'input_dim': X_train.shape[1],
                'hidden_dims': hidden_dims,
                'n_classes': n_classes,
                'dropout': dropout,
                'total_params': sum(p.numel() for p in model.parameters())
            }
        }

    @staticmethod
    async def train_lstm_forecaster(
        df: pd.DataFrame,
        experiment_id: str,
        date_col: str,
        target_col: str,
        sequence_length: int = 30,
        forecast_periods: int = 30,
        epochs: int = 50,
        lr: float = 0.001,
        progress_callback=None
    ) -> Dict[str, Any]:
        if not TORCH_AVAILABLE:
            raise ImportError("PyTorch not installed")

        device = DLService._get_device()
        df = await MLService.load_dataset(df)
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col).dropna(subset=[target_col])
        series = df[target_col].values.astype(np.float32)

        # Normalize
        mean, std = series.mean(), series.std() + 1e-8
        series_norm = (series - mean) / std

        # Create sequences
        def make_sequences(data, seq_len):
            X, y = [], []
            for i in range(len(data) - seq_len):
                X.append(data[i:i+seq_len])
                y.append(data[i+seq_len])
            return np.array(X), np.array(y)

        X_seq, y_seq = make_sequences(series_norm, sequence_length)
        split = int(len(X_seq) * 0.8)
        X_tr, X_te = X_seq[:split], X_seq[split:]
        y_tr, y_te = y_seq[:split], y_seq[split:]

        X_tr = torch.FloatTensor(X_tr).unsqueeze(-1).to(device)
        y_tr = torch.FloatTensor(y_tr).to(device)
        X_te = torch.FloatTensor(X_te).unsqueeze(-1).to(device)

        model = LSTMForecaster(1, 64, 2, 0.2).to(device)
        optimizer = optim.Adam(model.parameters(), lr=lr)
        criterion = nn.MSELoss()

        for epoch in range(epochs):
            model.train()
            optimizer.zero_grad()
            pred = model(X_tr)
            criterion(pred, y_tr).backward()
            optimizer.step()
            if progress_callback and (epoch+1) % max(1, epochs // 5) == 0:
                await progress_callback(10 + int(epoch/epochs * 70), f"LSTM epoch {epoch+1}/{epochs}")

        # Forecast future periods
        model.eval()
        with torch.no_grad():
            last_seq = torch.FloatTensor(series_norm[-sequence_length:]).unsqueeze(0).unsqueeze(-1).to(device)
            future_preds = []
            for _ in range(forecast_periods):
                p = model(last_seq).item()
                future_preds.append(p)
                last_seq = torch.cat([last_seq[:, 1:, :],
                                      torch.FloatTensor([[[p]]]).to(device)], dim=1)

        # Denormalize
        future_denorm = [v * std + mean for v in future_preds]

        # Test metrics
        y_te_pred = model(X_te).cpu().numpy() * std + mean
        y_te_actual = y_te.cpu().numpy() * std + mean

        from sklearn.metrics import mean_squared_error, mean_absolute_error
        metrics = {
            'rmse': round(float(np.sqrt(mean_squared_error(y_te_actual, y_te_pred))), 4),
            'mae': round(float(mean_absolute_error(y_te_actual, y_te_pred)), 4),
            'epochs': epochs,
            'sequence_length': sequence_length,
        }

        if progress_callback: await progress_callback(100, "LSTM training complete!")

        return {
            'metrics': metrics,
            'historical': [
                {'date': str(df[date_col].iloc[i].date()), 'actual': float(series[i])}
                for i in range(len(series))
            ],
            'forecast': [
                {'date': f"T+{i+1}", 'forecast': round(v, 4)}
                for i, v in enumerate(future_denorm)
            ]
        }
