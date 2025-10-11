import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface CurrencyInfo {
  code: string;
  name: string;
}

const CURRENCY_MAP: { [key: string]: CurrencyInfo } = {
  'USD': { code: 'USD', name: 'US Dollar' },
  'EUR': { code: 'EUR', name: 'Euro' },
  'GBP': { code: 'GBP', name: 'British Pound' },
  'JPY': { code: 'JPY', name: 'Japanese Yen' },
  'CNY': { code: 'CNY', name: 'Chinese Yuan' },
  'KRW': { code: 'KRW', name: 'South Korean Won' },
  'INR': { code: 'INR', name: 'Indian Rupee' },
  'SGD': { code: 'SGD', name: 'Singapore Dollar' },
  'AUD': { code: 'AUD', name: 'Australian Dollar' },
  'CAD': { code: 'CAD', name: 'Canadian Dollar' },
  'CHF': { code: 'CHF', name: 'Swiss Franc' },
  'SEK': { code: 'SEK', name: 'Swedish Krona' },
  'NOK': { code: 'NOK', name: 'Norwegian Krone' },
  'DKK': { code: 'DKK', name: 'Danish Krone' },
  'PLN': { code: 'PLN', name: 'Polish Zloty' },
  'CZK': { code: 'CZK', name: 'Czech Koruna' },
  'HUF': { code: 'HUF', name: 'Hungarian Forint' },
  'RUB': { code: 'RUB', name: 'Russian Ruble' },
  'TRY': { code: 'TRY', name: 'Turkish Lira' },
  'BRL': { code: 'BRL', name: 'Brazilian Real' },
  'MXN': { code: 'MXN', name: 'Mexican Peso' },
  'ARS': { code: 'ARS', name: 'Argentine Peso' },
  'CLP': { code: 'CLP', name: 'Chilean Peso' },
  'COP': { code: 'COP', name: 'Colombian Peso' },
  'PEN': { code: 'PEN', name: 'Peruvian Sol' },
  'ZAR': { code: 'ZAR', name: 'South African Rand' },
  'NGN': { code: 'NGN', name: 'Nigerian Naira' },
  'KES': { code: 'KES', name: 'Kenyan Shilling' },
  'EGP': { code: 'EGP', name: 'Egyptian Pound' },
  'SAR': { code: 'SAR', name: 'Saudi Riyal' },
  'AED': { code: 'AED', name: 'UAE Dirham' },
  'QAR': { code: 'QAR', name: 'Qatari Riyal' },
  'KWD': { code: 'KWD', name: 'Kuwaiti Dinar' },
  'BHD': { code: 'BHD', name: 'Bahraini Dinar' },
  'OMR': { code: 'OMR', name: 'Omani Rial' },
  'JOD': { code: 'JOD', name: 'Jordanian Dinar' },
  'ILS': { code: 'ILS', name: 'Israeli Shekel' },
  'MYR': { code: 'MYR', name: 'Malaysian Ringgit' },
  'THB': { code: 'THB', name: 'Thai Baht' },
  'PHP': { code: 'PHP', name: 'Philippine Peso' },
  'IDR': { code: 'IDR', name: 'Indonesian Rupiah' },
  'VND': { code: 'VND', name: 'Vietnamese Dong' },
  'TWD': { code: 'TWD', name: 'Taiwan Dollar' },
  'HKD': { code: 'HKD', name: 'Hong Kong Dollar' },
  'NZD': { code: 'NZD', name: 'New Zealand Dollar' },
};

export const useCurrency = () => {
  const { userProfile } = useAuthStore();
  const [userCurrency, setUserCurrency] = useState<CurrencyInfo>(CURRENCY_MAP['USD']);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Get user's default currency based on their country
  useEffect(() => {
    const fetchUserCurrency = async () => {
      if (!userProfile?.country_id) {
        setUserCurrency(CURRENCY_MAP['USD']);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('currency_code')
          .eq('id', userProfile.country_id)
          .single();

        if (data?.currency_code && CURRENCY_MAP[data.currency_code]) {
          setUserCurrency(CURRENCY_MAP[data.currency_code]);
        } else {
          setUserCurrency(CURRENCY_MAP['USD']);
        }
      } catch (error) {
        console.error('Error fetching user currency:', error);
        setUserCurrency(CURRENCY_MAP['USD']);
      } finally {
        setLoading(false);
      }
    };

    fetchUserCurrency();
  }, [userProfile?.country_id]);

  // Get the active currency (selected override or user's default)
  const activeCurrency = selectedCurrency && CURRENCY_MAP[selectedCurrency] 
    ? CURRENCY_MAP[selectedCurrency] 
    : userCurrency;

  // Format price with active currency CODE (not symbol)
  const formatPrice = (amount: number, options?: { showFullName?: boolean }) => {
    const { code, name } = activeCurrency;
    const formattedAmount = typeof amount === 'number' ? amount.toFixed(2) : '0.00';
    
    if (options?.showFullName) {
      return `${formattedAmount} ${name}`;
    }
    return `${formattedAmount} ${code}`;
  };

  // Get all available currencies for selector
  const availableCurrencies = Object.values(CURRENCY_MAP).sort((a, b) => a.name.localeCompare(b.name));

  // Reset to user's default currency
  const resetToUserCurrency = () => {
    setSelectedCurrency(null);
  };

  return {
    userCurrency,
    activeCurrency,
    selectedCurrency,
    setSelectedCurrency,
    formatPrice,
    availableCurrencies,
    resetToUserCurrency,
    loading,
    isUsingOverride: !!selectedCurrency,
  };
};