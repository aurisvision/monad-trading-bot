const ProfessionalMessageFormatter = require('./src/utils/ProfessionalMessageFormatter');

// إنشاء مثيل من المنسق
const formatter = new ProfessionalMessageFormatter();

// البيانات المحسنة بناءً على الرسالة الأصلية
const enhancedMessageData = {
    // البيانات الأساسية من الرسالة الأصلية
    txHash: '0x823b8ab48486e27dfe7cfeef4b0e3decb75921e75234212a38a48d61dd7b669a',
    tokenSymbol: 'USDC',
    tokenName: 'USD Coin', // بدلاً من undefined
    tokenAddress: '0xf817257fed379853cde0fa4f97ab987181b1e5ea',
    monAmount: 1,
    
    // البيانات المحسنة الجديدة
    tokenAmount: 0.985, // الكمية المتوقعة
    actualTokenAmount: 0.982, // الكمية الفعلية المستلمة (بدلاً من 0)
    expectedOutput: 0.985,
    
    // معلومات الغاز والأداء
    gasUsed: '301220',
    effectiveGasPrice: '45000000000', // 45 Gwei
    executionTime: 3200, // 3.2 ثانية
    
    // معلومات التداول
    priceImpact: '0.08', // بدلاً من N/A
    slippage: 3, // بدلاً من غير محدد
    mode: 'normal',
    
    // معلومات السعر والمسار
    tokenPrice: '1.0183', // سعر التوكن الفعلي
    route: ['MON', 'USDC'], // المسار المباشر
    
    // الوقت (نفس الوقت من الرسالة الأصلية)
    timestamp: new Date('2024-01-01T14:41:05').getTime()
};

console.log('🔥 الرسالة المحسنة مع جميع البيانات الصحيحة:');
console.log('='.repeat(80));
console.log(formatter.formatBuySuccess(enhancedMessageData));

console.log('\n📊 مقارنة التحسينات:');
console.log('='.repeat(50));
console.log('❌ الرسالة الأصلية:');
console.log('   • Token Name: undefined');
console.log('   • Received: 0 USDC');
console.log('   • Impact: N/A%');
console.log('   • لا يوجد معلومات عن نوع العملية');
console.log('   • لا يوجد معلومات عن Slippage');
console.log('   • لا يوجد سعر التوكن');
console.log('   • لا يوجد وقت التنفيذ');
console.log('   • لا يوجد معلومات عن سعر الغاز');

console.log('\n✅ الرسالة المحسنة:');
console.log('   • Token Name: USD Coin');
console.log('   • Expected: 0.985 USDC');
console.log('   • Received: 0.982 USDC');
console.log('   • Impact: 0.08%');
console.log('   • Mode: 🔒 NORMAL');
console.log('   • Slippage: 3%');
console.log('   • Token Price: $1.0183');
console.log('   • Route: MON → USDC');
console.log('   • Execution Time: 3200ms');
console.log('   • Gas Price: 45.0 Gwei');

console.log('\n🎯 النتيجة: رسالة شاملة ومفيدة للمستخدم!');