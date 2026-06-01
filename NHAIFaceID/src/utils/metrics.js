export const MetricsLogger = {
  times: {},
  
  startTimer: function(stepName) {
    this.times[stepName] = Date.now();
  },

  endTimer: function(stepName) {
    if (this.times[stepName]) {
      const duration = Date.now() - this.times[stepName];
      console.log(`[Metrics] ${stepName} completed in ${duration}ms`);
      return duration;
    }
    return 0;
  },

  logFPS: function(fps) {
    console.log(`[Metrics] Pipeline running at ${fps} FPS`);
  },

  logConfidence: function(confidence) {
    console.log(`[Metrics] Match Confidence Distribution logged: ${confidence.toFixed(2)}%`);
  }
};
