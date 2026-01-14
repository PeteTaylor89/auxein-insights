// src/components/climate/ClimateChart.jsx
import React, { useRef, useEffect } from 'react';
import 'chart.js/auto';
import { Line, Bar } from 'react-chartjs-2';

const ClimateChart = ({ data, chartType, comparisonMode, loading }) => {
  const chartRef = useRef();

  const getChartTitle = () => {
    switch (chartType) {
      case 'gdd':
        return comparisonMode === 'single' ? 
          'Growing Degree Days (Cumulative)' : 
          'Growing Degree Days Comparison';
      case 'huglin':
        return comparisonMode === 'single' ? 
          'Huglin Index (Cumulative)' : 
          'Huglin Index Comparison';
      case 'temperature':
        return comparisonMode === 'single' ? 
          'Average Monthly Temperature' : 
          'Temperature Comparison';
      case 'rainfall':
        return comparisonMode === 'single' ? 
          'Monthly Rainfall' : 
          'Rainfall Comparison';
      default:
        return 'Climate Data';
    }
  };

  const getYAxisLabel = () => {
    switch (chartType) {
      case 'gdd':
        return 'Growing Degree Days (°C·days)';
      case 'huglin':
        return 'Huglin Index';
      case 'temperature':
        return 'Temperature (°C)';
      case 'rainfall':
        return 'Rainfall (mm)';
      default:
        return 'Value';
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: getChartTitle(),
        font: {
          size: 16,
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 30
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            const unit = chartType === 'temperature' ? '°C' : 
                        chartType === 'rainfall' ? 'mm' : '';
            return `${label}: ${value}${unit}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Growing Season Month',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: getYAxisLabel(),
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        beginAtZero: true,
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    elements: {
      line: {
        tension: 0.1
      },
      point: {
        radius: 4,
        hoverRadius: 6
      }
    }
  };

  if (loading) {
    return (
      <div className="climate-chart">
        <div className="chart-loading">
          <p>Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.datasets || data.datasets.length === 0) {
    return (
      <div className="climate-chart">
        <div className="chart-placeholder">
          <p>No data available for the selected parameters</p>
        </div>
      </div>
    );
  }

  // Modify data for rainfall charts to have different opacity
  const chartData = { ...data };
  if (chartType === 'rainfall') {
    chartData.datasets = data.datasets.map(dataset => ({
      ...dataset,
      backgroundColor: dataset.backgroundColor?.replace(/\d{2}$/, '60') || dataset.borderColor + '60' // 60 = ~37% opacity
    }));
  }

  const ChartComponent = chartType === 'rainfall' ? Bar : Line;

  return (
    <div className="climate-chart">
      <div className="chart-wrapper">
        <ChartComponent
          ref={chartRef}
          data={chartData}
          options={chartOptions}
        />
      </div>
    </div>
  );
};

export default ClimateChart;