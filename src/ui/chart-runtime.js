let chartRuntimePromise;

export function loadChartRuntime() {
  if (!chartRuntimePromise) {
    chartRuntimePromise = Promise.all([
      import('chart.js/auto'),
      import('chartjs-plugin-datalabels')
    ]).then(([chartModule, dataLabelsModule]) => ({
      Chart: chartModule.default,
      ChartDataLabels: dataLabelsModule.default
    }));
  }

  return chartRuntimePromise;
}
