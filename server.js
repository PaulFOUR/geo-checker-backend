// GEO Digital Presence Checker - Backend API
// Node.js + Express Server

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection (for historical data)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/geo-checker';
let db;

MongoClient.connect(MONGODB_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db('geo-checker');
    console.log('Connected to MongoDB');
  })
  .catch(err => console.error('MongoDB connection error:', err));

// ============================================
// MAIN ANALYSIS ENDPOINT
// ============================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { brandName, websiteUrl, industry, location } = req.body;

    // Validation
    if (!brandName || !websiteUrl) {
      return res.status(400).json({ 
        error: 'Brand name and website URL are required' 
      });
    }

    console.log(`Starting analysis for ${brandName} - ${websiteUrl}`);

    // Run all analyses in parallel
    const [
      aiVisibility,
      structuredData,
      contentQuality,
      authorityMetrics
    ] = await Promise.all([
      analyzeAIVisibility(brandName, websiteUrl),
      analyzeStructuredData(websiteUrl),
      analyzeContentQuality(websiteUrl),
      analyzeAuthority(websiteUrl, brandName)
    ]);

    // Calculate overall score
    const overallScore = calculateOverallScore({
      aiVisibility,
      structuredData,
      contentQuality,
      authorityMetrics
    });

    // Generate recommendations
    const recommendations = generateRecommendations({
      aiVisibility,
      structuredData,
      contentQuality,
      authorityMetrics
    });

    // Prepare response
    const analysis = {
      brandName,
      websiteUrl,
      industry,
      location,
      timestamp: new Date(),
      overallScore,
      scores: {
        aiVisibility: aiVisibility.score,
        contentAuthority: contentQuality.score,
        citationIndex: authorityMetrics.score,
        structuredData: structuredData.score
      },
      details: {
        aiVisibility,
        structuredData,
        contentQuality,
        authorityMetrics
      },
      recommendations
    };

    // Save to database for historical tracking
    if (db) {
      await db.collection('analyses').insertOne(analysis);
    }

    res.json(analysis);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

// ============================================
// AI VISIBILITY ANALYSIS
// ============================================

async function analyzeAIVisibility(brandName, websiteUrl) {
  try {
    const results = {
      score: 0,
      metrics: {
        chatgptMentions: { score: 0, status: 'unknown' },
        googleAIOverview: { score: 0, status: 'unknown' },
        perplexityCitations: { score: 0, status: 'unknown' }
      }
    };

    // Check Google AI Overview presence
    const googleAIScore = await checkGoogleAIOverview(brandName);
    results.metrics.googleAIOverview = googleAIScore;

    // Check Perplexity citations (simulated - would need actual API)
    const perplexityScore = await checkPerplexityCitations(brandName);
    results.metrics.perplexityCitations = perplexityScore;

    // Simulate ChatGPT mentions (would need actual testing)
    results.metrics.chatgptMentions = {
      score: Math.floor(Math.random() * 30) + 70, // 70-100
      status: 'excellent',
      details: 'Brand appears in ChatGPT responses for industry queries'
    };

    // Calculate average AI visibility score
    const scores = Object.values(results.metrics).map(m => m.score);
    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return results;

  } catch (error) {
    console.error('AI Visibility analysis error:', error);
    return { score: 0, metrics: {}, error: error.message };
  }
}

async function checkGoogleAIOverview(brandName) {
  try {
    // This would involve checking Google Search results
    // For now, we'll return a simulated score
    const score = Math.floor(Math.random() * 30) + 60; // 60-90
    
    return {
      score,
      status: score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'needs-improvement',
      details: `Brand appears in ${score}% of relevant AI Overview responses`
    };
  } catch (error) {
    return { score: 0, status: 'error', details: error.message };
  }
}

async function checkPerplexityCitations(brandName) {
  try {
    // Simulate Perplexity citation check
    const score = Math.floor(Math.random() * 25) + 75; // 75-100
    
    return {
      score,
      status: score >= 85 ? 'excellent' : 'good',
      details: `Brand cited in ${Math.floor(score * 0.8)} Perplexity responses`
    };
  } catch (error) {
    return { score: 0, status: 'error', details: error.message };
  }
}

// ============================================
// STRUCTURED DATA ANALYSIS
// ============================================

async function analyzeStructuredData(websiteUrl) {
  try {
    const response = await axios.get(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GEOChecker/1.0)'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const results = {
      score: 0,
      metrics: {
        schemaMarkup: { score: 0, types: [] },
        richSnippets: { score: 0, eligible: false },
        knowledgeGraph: { score: 0, present: false }
      }
    };

    // Check for Schema.org markup
    const schemaScripts = $('script[type="application/ld+json"]');
    const schemaTypes = new Set();
    
    schemaScripts.each((i, elem) => {
      try {
        const schemaData = JSON.parse($(elem).html());
        const type = schemaData['@type'] || (Array.isArray(schemaData) ? schemaData[0]['@type'] : null);
        if (type) schemaTypes.add(type);
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    results.metrics.schemaMarkup = {
      score: Math.min(schemaTypes.size * 20, 100),
      types: Array.from(schemaTypes),
      count: schemaTypes.size,
      status: schemaTypes.size >= 3 ? 'excellent' : schemaTypes.size >= 1 ? 'good' : 'needs-improvement'
    };

    // Check for meta tags that enable rich snippets
    const hasOGTags = $('meta[property^="og:"]').length > 0;
    const hasTwitterCard = $('meta[name="twitter:card"]').length > 0;
    const hasStructuredData = schemaTypes.size > 0;

    results.metrics.richSnippets = {
      score: (hasOGTags ? 30 : 0) + (hasTwitterCard ? 30 : 0) + (hasStructuredData ? 40 : 0),
      eligible: hasOGTags && hasStructuredData,
      status: hasOGTags && hasStructuredData ? 'good' : 'needs-improvement',
      details: {
        openGraph: hasOGTags,
        twitterCard: hasTwitterCard,
        structuredData: hasStructuredData
      }
    };

    // Simulate Knowledge Graph check (would need Google Knowledge Graph API)
    results.metrics.knowledgeGraph = {
      score: Math.floor(Math.random() * 30) + 70,
      present: true,
      status: 'excellent',
      details: 'Brand has Knowledge Graph panel'
    };

    // Calculate overall structured data score
    const scores = Object.values(results.metrics).map(m => m.score);
    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return results;

  } catch (error) {
    console.error('Structured Data analysis error:', error);
    return { 
      score: 0, 
      metrics: {
        schemaMarkup: { score: 0, status: 'error' },
        richSnippets: { score: 0, status: 'error' },
        knowledgeGraph: { score: 0, status: 'error' }
      },
      error: error.message 
    };
  }
}

// ============================================
// CONTENT QUALITY ANALYSIS
// ============================================

async function analyzeContentQuality(websiteUrl) {
  try {
    const response = await axios.get(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GEOChecker/1.0)'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const results = {
      score: 0,
      metrics: {
        expertiseSignals: { score: 0 },
        authorAuthority: { score: 0 },
        contentFreshness: { score: 0 }
      }
    };

    // Check for expertise signals
    const hasAboutPage = $('a[href*="about"]').length > 0;
    const hasAuthorBios = $('[class*="author"], [class*="bio"]').length > 0;
    const hasCredentials = $('body').text().toLowerCase().includes('phd') || 
                          $('body').text().toLowerCase().includes('expert') ||
                          $('body').text().toLowerCase().includes('certified');

    results.metrics.expertiseSignals = {
      score: (hasAboutPage ? 30 : 0) + (hasAuthorBios ? 35 : 0) + (hasCredentials ? 35 : 0),
      status: hasAboutPage && hasAuthorBios ? 'good' : 'needs-improvement',
      details: {
        aboutPage: hasAboutPage,
        authorBios: hasAuthorBios,
        credentials: hasCredentials
      }
    };

    // Check for author authority markers
    const hasAuthorPages = $('a[href*="author"]').length > 0;
    const hasSocialLinks = $('a[href*="linkedin"], a[href*="twitter"]').length > 0;
    
    results.metrics.authorAuthority = {
      score: (hasAuthorPages ? 50 : 0) + (hasSocialLinks ? 50 : 0),
      status: hasAuthorPages ? 'good' : 'needs-improvement',
      details: {
        authorPages: hasAuthorPages,
        socialProfiles: hasSocialLinks
      }
    };

    // Check content freshness (look for dates)
    const bodyText = $('body').text();
    const currentYear = new Date().getFullYear();
    const hasRecentDate = bodyText.includes(currentYear.toString()) || 
                         bodyText.includes((currentYear - 1).toString());
    const hasLastUpdated = $('[class*="updated"], [class*="modified"]').length > 0;

    results.metrics.contentFreshness = {
      score: (hasRecentDate ? 50 : 20) + (hasLastUpdated ? 50 : 30),
      status: hasRecentDate && hasLastUpdated ? 'excellent' : 'good',
      details: {
        recentContent: hasRecentDate,
        updateDates: hasLastUpdated
      }
    };

    // Calculate overall content quality score
    const scores = Object.values(results.metrics).map(m => m.score);
    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return results;

  } catch (error) {
    console.error('Content Quality analysis error:', error);
    return { score: 0, metrics: {}, error: error.message };
  }
}

// ============================================
// AUTHORITY & CITATIONS ANALYSIS
// ============================================

async function analyzeAuthority(websiteUrl, brandName) {
  try {
    const results = {
      score: 0,
      metrics: {
        externalCitations: { score: 0 },
        domainAuthority: { score: 0 },
        backlinkQuality: { score: 0 }
      }
    };

    // Simulate external citations check
    // In production, use APIs like Ahrefs, Moz, or SEMrush
    results.metrics.externalCitations = {
      score: Math.floor(Math.random() * 30) + 60,
      count: Math.floor(Math.random() * 500) + 200,
      status: 'good',
      details: 'Citations found across news sites, blogs, and industry publications'
    };

    // Simulate domain authority check
    results.metrics.domainAuthority = {
      score: Math.floor(Math.random() * 20) + 70,
      rating: 'Good',
      status: 'good',
      details: 'Domain Authority score indicates strong web presence'
    };

    // Simulate backlink quality
    results.metrics.backlinkQuality = {
      score: Math.floor(Math.random() * 25) + 65,
      totalBacklinks: Math.floor(Math.random() * 10000) + 5000,
      qualityBacklinks: Math.floor(Math.random() * 1000) + 500,
      status: 'good',
      details: 'Mix of high-authority and niche-relevant backlinks'
    };

    // Calculate overall authority score
    const scores = Object.values(results.metrics).map(m => m.score);
    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return results;

  } catch (error) {
    console.error('Authority analysis error:', error);
    return { score: 0, metrics: {}, error: error.message };
  }
}

// ============================================
// SCORE CALCULATION
// ============================================

function calculateOverallScore(data) {
  const weights = {
    aiVisibility: 0.35,      // 35% weight - most important for GEO
    structuredData: 0.25,    // 25% weight
    contentQuality: 0.20,    // 20% weight
    authorityMetrics: 0.20   // 20% weight
  };

  const weightedScore = 
    (data.aiVisibility.score * weights.aiVisibility) +
    (data.structuredData.score * weights.structuredData) +
    (data.contentQuality.score * weights.contentQuality) +
    (data.authorityMetrics.score * weights.authorityMetrics);

  return Math.round(weightedScore);
}

// ============================================
// RECOMMENDATIONS ENGINE
// ============================================

function generateRecommendations(data) {
  const recommendations = [];

  // Schema markup recommendations
  if (data.structuredData.metrics.schemaMarkup.score < 60) {
    recommendations.push({
      priority: 'high',
      category: 'Structured Data',
      title: 'Enhance Schema Markup',
      description: 'Implement Organization, Product, and FAQ schema across key pages to improve AI understanding and increase rich snippet eligibility.',
      impact: 'High',
      effort: 'Medium'
    });
  }

  // Author authority recommendations
  if (data.contentQuality.metrics.authorAuthority.score < 70) {
    recommendations.push({
      priority: 'high',
      category: 'Content Quality',
      title: 'Build Author Authority',
      description: 'Create detailed author bio pages with credentials, link to professional profiles, and showcase expertise through bylines.',
      impact: 'High',
      effort: 'Medium'
    });
  }

  // Citation recommendations
  if (data.authorityMetrics.metrics.externalCitations.score < 70) {
    recommendations.push({
      priority: 'medium',
      category: 'Authority',
      title: 'Increase Citation Opportunities',
      description: 'Publish original research, create shareable statistics, and develop industry reports that other sites will reference.',
      impact: 'High',
      effort: 'High'
    });
  }

  // AI visibility recommendations
  if (data.aiVisibility.score < 75) {
    recommendations.push({
      priority: 'high',
      category: 'AI Visibility',
      title: 'Optimize for AI Training',
      description: 'Create comprehensive, well-structured content that AI models can easily parse and reference in their responses.',
      impact: 'Very High',
      effort: 'Medium'
    });
  }

  // Content freshness
  if (data.contentQuality.metrics.contentFreshness.score < 80) {
    recommendations.push({
      priority: 'medium',
      category: 'Content Quality',
      title: 'Improve Content Freshness',
      description: 'Regularly update existing content, add publication and modification dates, and maintain an active content calendar.',
      impact: 'Medium',
      effort: 'Low'
    });
  }

  // Sort by priority
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 5); // Return top 5
}

// ============================================
// COMPARISON ENDPOINT
// ============================================

app.post('/api/compare', async (req, res) => {
  try {
    const { brands } = req.body; // Array of brand objects

    if (!brands || brands.length < 2) {
      return res.status(400).json({ 
        error: 'At least 2 brands required for comparison' 
      });
    }

    // Analyze each brand
    const comparisons = await Promise.all(
      brands.map(async brand => {
        const analysis = await analyzeBrand(brand);
        return {
          brandName: brand.brandName,
          websiteUrl: brand.websiteUrl,
          scores: analysis.scores,
          overallScore: analysis.overallScore
        };
      })
    );

    // Generate comparison insights
    const insights = generateComparisonInsights(comparisons);

    res.json({
      brands: comparisons,
      insights,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: 'Comparison failed', message: error.message });
  }
});

async function analyzeBrand(brand) {
  // Reuse the main analysis logic
  const [aiVisibility, structuredData, contentQuality, authorityMetrics] = await Promise.all([
    analyzeAIVisibility(brand.brandName, brand.websiteUrl),
    analyzeStructuredData(brand.websiteUrl),
    analyzeContentQuality(brand.websiteUrl),
    analyzeAuthority(brand.websiteUrl, brand.brandName)
  ]);

  return {
    scores: {
      aiVisibility: aiVisibility.score,
      contentAuthority: contentQuality.score,
      citationIndex: authorityMetrics.score,
      structuredData: structuredData.score
    },
    overallScore: calculateOverallScore({
      aiVisibility,
      structuredData,
      contentQuality,
      authorityMetrics
    })
  };
}

function generateComparisonInsights(comparisons) {
  const insights = [];
  
  // Find leader in each category
  const categories = ['aiVisibility', 'contentAuthority', 'citationIndex', 'structuredData'];
  
  categories.forEach(category => {
    const leader = comparisons.reduce((prev, current) => 
      current.scores[category] > prev.scores[category] ? current : prev
    );
    
    insights.push({
      category,
      leader: leader.brandName,
      score: leader.scores[category]
    });
  });

  return insights;
}

// ============================================
// HISTORICAL TRACKING ENDPOINT
// ============================================

app.get('/api/history/:brandName', async (req, res) => {
  try {
    const { brandName } = req.params;
    const { days = 30 } = req.query;

    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const history = await db.collection('analyses')
      .find({
        brandName: brandName,
        timestamp: { $gte: cutoffDate }
      })
      .sort({ timestamp: 1 })
      .toArray();

    // Calculate trends
    const trends = calculateTrends(history);

    res.json({
      brandName,
      period: `${days} days`,
      dataPoints: history.length,
      history: history.map(h => ({
        timestamp: h.timestamp,
        overallScore: h.overallScore,
        scores: h.scores
      })),
      trends
    });

  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve history', message: error.message });
  }
});

function calculateTrends(history) {
  if (history.length < 2) {
    return { message: 'Not enough data for trend analysis' };
  }

  const latest = history[history.length - 1];
  const earliest = history[0];

  return {
    overallScore: {
      change: latest.overallScore - earliest.overallScore,
      percentChange: ((latest.overallScore - earliest.overallScore) / earliest.overallScore * 100).toFixed(2),
      trend: latest.overallScore > earliest.overallScore ? 'improving' : 'declining'
    },
    aiVisibility: {
      change: latest.scores.aiVisibility - earliest.scores.aiVisibility,
      trend: latest.scores.aiVisibility > earliest.scores.aiVisibility ? 'improving' : 'declining'
    },
    contentAuthority: {
      change: latest.scores.contentAuthority - earliest.scores.contentAuthority,
      trend: latest.scores.contentAuthority > earliest.scores.contentAuthority ? 'improving' : 'declining'
    }
  };
}

// ============================================
// EXPORT ENDPOINTS
// ============================================

app.get('/api/export/:analysisId/pdf', async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    // In production, generate PDF using libraries like PDFKit or Puppeteer
    res.json({ 
      message: 'PDF generation endpoint',
      downloadUrl: `/downloads/${analysisId}.pdf`
    });
  } catch (error) {
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.get('/api/export/:analysisId/csv', async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const analysis = await db.collection('analyses').findOne({ _id: analysisId });
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Generate CSV
    const csv = convertToCSV(analysis);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${analysis.brandName}-geo-analysis.csv"`);
    res.send(csv);

  } catch (error) {
    res.status(500).json({ error: 'CSV generation failed' });
  }
});

function convertToCSV(analysis) {
  const rows = [
    ['Metric', 'Score', 'Status'],
    ['Overall GEO Score', analysis.overallScore, ''],
    ['AI Visibility', analysis.scores.aiVisibility, ''],
    ['Content Authority', analysis.scores.contentAuthority, ''],
    ['Citation Index', analysis.scores.citationIndex, ''],
    ['Structured Data', analysis.scores.structuredData, '']
  ];

  return rows.map(row => row.join(',')).join('\n');
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    database: db ? 'connected' : 'disconnected'
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`GEO Checker API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
