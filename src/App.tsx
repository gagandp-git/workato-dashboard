import { useState, useEffect } from 'react'
import { BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import './App.css'
const API = import.meta.env.VITE_API_URL as string;

interface Connection {
  application: string
  name: string
  authorization_status: string
}

interface Job {
  status: string
  is_error: string
  completed_at: string
  started_at: string
  recipe_id: string
}

interface Project {
  name: string
  id: string
  folder_id: string
}

interface Recipe {
  id: string
  name: string
  running: string
  job_succeeded_count: string
  job_failed_count: string
  project_id: string
}

const COLORS = ['#11998e', '#38ef7d', '#06d6a0', '#1dd1a1', '#10ac84', '#05c46b']

function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

 
useEffect(() => {
  const fetchData = async () => {
    try {
      setLoading(true);

      const [projectsRes, connectionsRes, jobsRes, recipesRes] = await Promise.all([
        fetch(`${API}/api/projects`),
        fetch(`${API}/api/connections`),
        fetch(`${API}/api/jobs`),
        fetch(`${API}/api/recipes`)
      ]);

      setProjects(await projectsRes.json());
      setConnections(await connectionsRes.json());
      setJobs(await jobsRes.json());
      setRecipes(await recipesRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);   // ✅ runs AFTER fetch completes
    }
  };


}, []);

  const connectionStats = {
    total: connections.length,
    active: connections.filter(c => c.authorization_status === 'success').length,
    failed: connections.filter(c => c.authorization_status !== 'success' && c.authorization_status).length
  }

  const filteredJobs = jobs.filter(job => {
    let match = true
    if (selectedRecipe !== 'all' && job.recipe_id !== selectedRecipe) match = false
    if (startDate && job.completed_at && new Date(job.completed_at) < new Date(startDate)) match = false
    if (endDate && job.completed_at && new Date(job.completed_at) > new Date(endDate)) match = false
    return match
  })

  const filteredRecipes = recipes.filter(recipe => {
    if (selectedProject !== 'all' && recipe.project_id !== selectedProject) return false
    return true
  })

  const jobStats = {
    total: filteredJobs.length,
    succeeded: filteredJobs.filter(j => j.status === 'succeeded').length,
    failed: filteredJobs.filter(j => j.status === 'failed').length
  }

  const connectionByApp = connections.reduce((acc, conn) => {
    acc[conn.application] = (acc[conn.application] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const appData = Object.entries(connectionByApp).map(([name, value]) => ({ name, value }))

  const recipeStats = filteredRecipes.map(r => ({
    name: r.name.substring(0, 20) + '...',
    succeeded: parseInt(r.job_succeeded_count) || 0,
    failed: parseInt(r.job_failed_count) || 0
  })).slice(0, 5)

  const jobsByDate = filteredJobs.reduce((acc, job) => {
    if (job.completed_at) {
      const date = new Date(job.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!acc[date]) acc[date] = { date, succeeded: 0, failed: 0 }
      if (job.status === 'succeeded') acc[date].succeeded++
      else if (job.status === 'failed') acc[date].failed++
    }
    return acc
  }, {} as Record<string, { date: string; succeeded: number; failed: number }>)

  const dailyJobData = Object.values(jobsByDate).slice(-7)

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Insight Development Dashboard</h1>
        <p>Real-time Analytics & Monitoring</p>
      </header>

      <div className="filters">
        <div className="filter-group">
          <label>Project:</label>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
            <option value="all">All Projects</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Recipe:</label>
          <select value={selectedRecipe} onChange={(e) => setSelectedRecipe(e.target.value)}>
            <option value="all">All Recipes</option>
            {recipes.filter(r => selectedProject === 'all' || r.project_id === selectedProject).map((r: any) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Start Date:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className="filter-group">
          <label>End Date:</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <button className="reset-btn" onClick={() => {
          setSelectedRecipe('all')
          setSelectedProject('all')
          setStartDate('')
          setEndDate('')
        }}>Reset Filters</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-content">
            <h3>Connections</h3>
            <div className="stat-number">{connectionStats.total}</div>
            <div className="stat-detail">
              <span className="success">{connectionStats.active} Active</span>
              <span className="error">{connectionStats.failed} Failed</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Jobs</h3>
            <div className="stat-number">{jobStats.total}</div>
            <div className="stat-detail">
              <span className="success">{jobStats.succeeded} Success</span>
              <span className="error">{jobStats.failed} Failed</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Projects</h3>
            <div className="stat-number">{projects.length}</div>
            <div className="stat-detail">Active Projects</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Recipes</h3>
            <div className="stat-number">{recipes.length}</div>
            <div className="stat-detail">
              <span className="success">{recipes.filter(r => r.running === 'TRUE').length} Running</span>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Connections by Application</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={appData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {appData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Job Status Overview</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyJobData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="succeeded" stackId="a" fill="#43e97b" name="Succeeded" />
              <Bar dataKey="failed" stackId="a" fill="#fa709a" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h3>Top 5 Recipes Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={recipeStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="succeeded" fill="#43e97b" name="Succeeded" />
              <Bar dataKey="failed" fill="#fa709a" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-section">
        <h3>Recent Projects</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>ID</th>
                <th>Folder ID</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 8).map((project: any, idx) => (
                <tr key={idx}>
                  <td>{project.name}</td>
                  <td>{project.id}</td>
                  <td>{project.folder_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App
