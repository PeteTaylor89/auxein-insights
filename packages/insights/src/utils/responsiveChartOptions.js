// packages/insights/src/utils/responsiveChartOptions.js
/**
 * Responsive Chart.js Configuration Utilities
 * 
 * Provides mobile-optimized chart options for all climate explorers.
 * Import and merge these with your chart-specific options.
 */

/**
 * Detect if current viewport is mobile
 */
export const isMobile = () => window.innerWidth <= 768;
export const isSmallMobile = () => window.innerWidth <= 480;

/**
 * Base responsive options for all charts
 * These ensure charts resize properly within their containers
 */
export const getBaseChartOptions = () => ({
  responsive: true,
  maintainAspectRatio: false, // CRITICAL: Allows chart to fill container height
  resizeDelay: 100, // Debounce resize events
});

/**
 * Responsive legend configuration
 * Moves legend to bottom on mobile, adjusts sizing
 */
export const getResponsiveLegend = (options = {}) => {
  const mobile = isMobile();
  const smallMobile = isSmallMobile();
  
  return {
    display: options.display !== false,
    position: mobile ? 'bottom' : (options.position || 'top'),
    align: mobile ? 'start' : 'center',
    labels: {
      usePointStyle: true,
      padding: mobile ? 8 : 15,
      boxWidth: mobile ? 8 : 12,
      font: {
        size: smallMobile ? 10 : mobile ? 11 : 12,
      },
      ...options.labels,
    },
    ...options,
  };
};

/**
 * Responsive tooltip configuration
 */
export const getResponsiveTooltip = (options = {}) => {
  const mobile = isMobile();
  
  return {
    mode: 'index',
    intersect: false,
    enabled: true,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    titleFont: {
      size: mobile ? 11 : 13,
    },
    bodyFont: {
      size: mobile ? 10 : 12,
    },
    padding: mobile ? 8 : 12,
    cornerRadius: 6,
    ...options,
  };
};

/**
 * Responsive X-axis configuration
 */
export const getResponsiveXAxis = (options = {}) => {
  const mobile = isMobile();
  const smallMobile = isSmallMobile();
  
  return {
    ticks: {
      maxTicksLimit: smallMobile ? 5 : mobile ? 7 : 10,
      maxRotation: mobile ? 45 : 0,
      minRotation: 0,
      font: {
        size: smallMobile ? 9 : mobile ? 10 : 11,
      },
      ...options.ticks,
    },
    grid: {
      display: !smallMobile,
      drawOnChartArea: true,
      ...options.grid,
    },
    ...options,
  };
};

/**
 * Responsive Y-axis configuration
 */
export const getResponsiveYAxis = (options = {}) => {
  const mobile = isMobile();
  const smallMobile = isSmallMobile();
  
  return {
    ticks: {
      maxTicksLimit: smallMobile ? 5 : mobile ? 6 : 8,
      font: {
        size: smallMobile ? 9 : mobile ? 10 : 11,
      },
      ...options.ticks,
    },
    title: {
      display: !smallMobile,
      font: {
        size: mobile ? 10 : 12,
      },
      ...options.title,
    },
    grid: {
      display: true,
      ...options.grid,
    },
    ...options,
  };
};

/**
 * Get complete responsive line chart options
 */
export const getResponsiveLineChartOptions = (customOptions = {}) => {
  const mobile = isMobile();
  
  return {
    ...getBaseChartOptions(),
    plugins: {
      legend: getResponsiveLegend(customOptions.legend),
      tooltip: getResponsiveTooltip(customOptions.tooltip),
      title: customOptions.title ? {
        display: true,
        font: {
          size: mobile ? 14 : 16,
          weight: 'bold',
        },
        padding: {
          bottom: mobile ? 12 : 20,
        },
        ...customOptions.title,
      } : undefined,
    },
    scales: {
      x: getResponsiveXAxis(customOptions.xAxis),
      y: getResponsiveYAxis(customOptions.yAxis),
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    elements: {
      point: {
        radius: mobile ? 2 : 3,
        hoverRadius: mobile ? 4 : 6,
      },
      line: {
        tension: 0.3,
        borderWidth: mobile ? 2 : 2.5,
      },
    },
    ...customOptions,
  };
};

/**
 * Get complete responsive bar chart options
 */
export const getResponsiveBarChartOptions = (customOptions = {}) => {
  const mobile = isMobile();
  
  return {
    ...getBaseChartOptions(),
    plugins: {
      legend: getResponsiveLegend({ display: false, ...customOptions.legend }),
      tooltip: getResponsiveTooltip(customOptions.tooltip),
    },
    scales: {
      x: getResponsiveXAxis(customOptions.xAxis),
      y: getResponsiveYAxis({
        beginAtZero: true,
        ...customOptions.yAxis,
      }),
    },
    barPercentage: mobile ? 0.9 : 0.8,
    categoryPercentage: mobile ? 0.9 : 0.8,
    ...customOptions,
  };
};

/**
 * Hook for responsive chart options
 * Call this to get options that update on window resize
 */
export const useResponsiveChartOptions = (getOptions) => {
  const [options, setOptions] = React.useState(getOptions);
  
  React.useEffect(() => {
    const handleResize = () => {
      setOptions(getOptions());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getOptions]);
  
  return options;
};

// For non-React usage, export a function to regenerate options
export const regenerateOptions = (optionsFn) => {
  return optionsFn();
};

/**
 * Example usage in a component:
 * 
 * import { getResponsiveLineChartOptions } from '../../utils/responsiveChartOptions';
 * 
 * const MyChart = () => {
 *   const chartOptions = useMemo(() => getResponsiveLineChartOptions({
 *     yAxis: {
 *       title: { text: 'Temperature (°C)' },
 *       beginAtZero: false,
 *     },
 *     legend: { position: 'top' },
 *   }), []);
 *   
 *   return <Line data={chartData} options={chartOptions} />;
 * };
 */