const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { syncRecord } = require('./aggregate-core.cjs');

initializeApp();
// Region is configurable at deployment; default matches the team's location.
const region = process.env.FUNCTION_REGION || 'southamerica-east1';
exports.aggregateOrders = onDocumentWritten({ document: 'orders/{id}', region, retry: true }, event => syncRecord(getFirestore(), 'orders', event.params.id));
exports.aggregateBonifications = onDocumentWritten({ document: 'bonifications/{id}', region, retry: true }, event => syncRecord(getFirestore(), 'bonifications', event.params.id));
