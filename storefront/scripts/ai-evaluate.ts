#!/usr/bin/env npx tsx
/**
 * AI Evaluation CLI
 * 
 * Run with: npm run ai:evaluate
 */

import { generateAiEvalReport, printEvalReport } from '../src/lib/ai/evaluation';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('GloveCubs AI Evaluation Harness');
  console.log('================================\n');
  
  try {
    // Generate report
    const report = await generateAiEvalReport();
    
    // Print to console
    printEvalReport(report);
    
    // Save JSON report
    const outputDir = join(process.cwd(), 'reports');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = join(outputDir, `ai-eval-${timestamp}.json`);
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    
    console.log(`\nReport saved to: ${outputPath}`);
    
    // Exit with appropriate code
    if (report.overall_health === 'critical') {
      console.log('\n⚠️  AI health is CRITICAL. Immediate attention required.');
      process.exit(1);
    } else if (report.overall_health === 'degraded') {
      console.log('\n⚡ AI health is DEGRADED. Review recommendations.');
      process.exit(0);
    } else {
      console.log('\n✅ AI health is HEALTHY.');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Evaluation failed:', error);
    process.exit(1);
  }
}

main();
