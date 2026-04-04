import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function JEPScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Judicial Evidence Packet (JEP)</h1>
      <div className="bg-card p-6 rounded-lg shadow border">
        <h2 className="text-xl font-semibold mb-4">Plain Language Explanation</h2>
        <div className="space-y-4">
          <p><strong>English:</strong> Your claim was approved because the system detected rainfall exceeding 30mm/hr in your area.</p>
          <p><strong>Hindi:</strong> आपका दावा स्वीकृत कर लिया गया है क्योंकि सिस्टम ने आपके क्षेत्र में 30 मिमी/घंटा से अधिक वर्षा का पता लगाया है।</p>
        </div>
      </div>
      <button 
        onClick={() => navigate('/claims')}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
      >
        Back to Claims
      </button>
    </div>
  );
}
