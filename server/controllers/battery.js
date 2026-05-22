exports.getBatteryAdvice = async (req, res) => {
  try {
    const { chargingFrequency, fastChargingUsage, chargingRange, dailyUsagePattern } = req.body;

    let baseLifeImprovement = 0;
    let riskLevel = 'Low';
    const recommendations = [];

    // Evaluate Charging Range
    if (chargingRange === '20-80') {
      baseLifeImprovement += 15;
    } else if (chargingRange === '20-90') {
      baseLifeImprovement += 8;
    } else if (chargingRange === '0-100') {
      recommendations.push("Avoid charging to 100% and draining to 0% daily. Limit charging to 80% for regular use.");
    }

    // Evaluate Fast Charging Usage
    if (fastChargingUsage === 'never') {
      baseLifeImprovement += 10;
    } else if (fastChargingUsage === 'sometimes') {
      baseLifeImprovement += 5;
    } else if (fastChargingUsage === 'often') {
      recommendations.push("Reduce the use of DC Fast Charging. Rely on AC slow charging for daily needs to reduce thermal degradation.");
    }

    // Evaluate Charging Frequency
    if (chargingFrequency === 'every2days') {
      baseLifeImprovement += 5;
    } else if (chargingFrequency === 'weekly') {
      recommendations.push("Charging weekly might mean deeper discharge cycles. Try charging more frequently to shallower depths if possible.");
    }

    // Evaluate Risk Level
    if (fastChargingUsage === 'often' && chargingRange === '0-100') {
      riskLevel = 'High';
      recommendations.push("Your current habits cause high thermal stress. Immediately adjust charging limits to 80%.");
    } else if (
      (fastChargingUsage === 'sometimes' || fastChargingUsage === 'often') && 
      (chargingRange === '20-90' || chargingRange === '0-100')
    ) {
      riskLevel = 'Medium';
    }

    // Default recommendation if doing well
    if (recommendations.length === 0) {
      recommendations.push("Keep up the great work! Your battery management habits are optimal for long-term health.");
    }

    // Ensure positive improvement stat
    const expectedLifeImprovement = Math.max(0, baseLifeImprovement);

    res.json({
      ok: true,
      data: {
        currentPractice: {
          chargingFrequency,
          fastChargingUsage,
          chargingRange,
          dailyUsagePattern
        },
        recommendations,
        expectedLifeImprovement,
        riskLevel
      }
    });

  } catch (err) {
    console.error("Battery advice error:", err);
    res.status(500).json({ ok: false, message: 'Server error generating battery advice.' });
  }
};
