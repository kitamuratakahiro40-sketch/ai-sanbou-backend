"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  fileName: string;
  status: string;
  inputType: "AUDIO" | "TEXT";
  targetName?: string;
  createdAt: string;
}

export default function JobDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchJobs = async () => {
    try {
      const timestamp = Date.now();
      // Force full URL to avoid proxy issues during debug
      const res = await fetch(`http://localhost:3001/api/jobs?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Safety check: ensure data is actually an array
        if (Array.isArray(data)) {
          setJobs(data);
          setError("");
        } else {
          console.error("Data is not an array:", data);
          setJobs([]);
        }
      } else {
        console.error("Fetch failed:", res.status, res.statusText);
        setError("API Connection Failed");
      }
    } catch (error) {
      console.error("Failed to fetch jobs", error);
      setError("Network Error - Is API running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === 'PROCESSING' || job.status === 'UPLOADED'
    );

    if (hasActiveJobs) {
      const intervalId = setInterval(() => {
        fetchJobs();
      }, 3000);
      return () => clearInterval(intervalId);
    }
  }, [jobs]);

  if (loading) return <div className="text-center text-slate-500 py-4 animate-pulse">Loading mission log...</div>;
  
  if (error) {
    return (
      <div className="text-center text-red-400 py-8 bg-slate-800/50 rounded-xl border border-red-900/50">
        <p className="font-bold">⚠️ {error}</p>
        <p className="text-xs text-slate-500 mt-2">Check if Backend (Terminal 2) is running on port 3001</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center text-slate-500 py-16 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
        <p className="text-lg">No Mission Data</p>
        <p className="text-sm mt-2 opacity-60">Upload audio or text to begin analysis.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 animate-fade-in">
      {jobs.map((job) => (
        <Link 
          href={`/jobs/${job.id}`} 
          key={job.id}
          className="block bg-slate-800 p-5 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-750 transition-all duration-200 group shadow-md hover:shadow-lg hover:-translate-y-0.5"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl bg-slate-700/50 group-hover:scale-110 transition-transform ${
                job.inputType === "AUDIO" ? "text-blue-400" : "text-purple-400"
              }`}>
                {job.inputType === "AUDIO" ? "🎙️" : "📝"}
              </div>
              
              <div>
                <div className="font-bold text-slate-200 text-lg group-hover:text-blue-300 transition-colors">
                  {job.targetName || job.fileName || "Untitled Job"}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  ID: {job.id.slice(0, 8)}... • {new Date(job.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider border transition-colors duration-500 ${
              job.status === "COMPLETED" ? "bg-green-900/30 text-green-400 border-green-800" :
              job.status === "PROCESSING" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)]" :
              job.status === "FAILED" ? "bg-red-900/30 text-red-400 border-red-800" :
              "bg-slate-700/50 text-slate-400 border-slate-600"
            }`}>
              {job.status}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}