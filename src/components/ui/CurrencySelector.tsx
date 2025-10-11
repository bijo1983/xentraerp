import React from 'react';
import { DollarSign, RotateCcw } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';

interface CurrencySelectorProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({ 
  className = '', 
  showLabel = true,
  compact = false 
}) => {
  const {
    userCurrency,
    activeCurrency,
    selectedCurrency,
    setSelectedCurrency,
    availableCurrencies,
    resetToUserCurrency,
    isUsingOverride,
  } = useCurrency();

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <select
          value={selectedCurrency || userCurrency.code}
          onChange={(e) => setSelectedCurrency(e.target.value === userCurrency.code ? null : e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/90"
        >
          <option value={userCurrency.code}>
            {userCurrency.code}
          </option>
          {availableCurrencies
            .filter(currency => currency.code !== userCurrency.code)
            .map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
        </select>
        {isUsingOverride && (
          <button
            onClick={resetToUserCurrency}
            className="text-gray-500 hover:text-gray-700 p-1"
            title="Reset to your default currency"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      {showLabel && (
        <div className="flex items-center mb-3">
          <DollarSign className="h-5 w-5 text-gray-600 mr-2" />
          <h3 className="font-medium text-gray-900">Currency Display</h3>
        </div>
      )}
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Currency
          </label>
          <select
            value={selectedCurrency || userCurrency.code}
            onChange={(e) => setSelectedCurrency(e.target.value === userCurrency.code ? null : e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={userCurrency.code}>
              {userCurrency.code} - {userCurrency.name} (Your Default)
            </option>
            {availableCurrencies
              .filter(currency => currency.code !== userCurrency.code)
              .map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} - {currency.name}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Current: <span className="font-medium">{activeCurrency.code} - {activeCurrency.name}</span>
          </span>
          {isUsingOverride && (
            <button
              onClick={resetToUserCurrency}
              className="flex items-center space-x-1 text-blue-600 hover:text-blue-800"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {isUsingOverride && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> You're viewing prices in {activeCurrency.name} ({activeCurrency.code}). 
              Your default currency is {userCurrency.name} ({userCurrency.code}) based on your country setting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};