import { useState } from "react"
import { supabase } from "./supabase"

export default function Login({ onLogin }: any) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      alert(error.message)
      return
    }

    localStorage.setItem("token", data.session.access_token)
    onLogin()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Sign in</h2>
        <p className="login-subtitle">Use your Supabase email and password to continue.</p>

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            className="login-input"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>

        <button className="login-btn" onClick={handleLogin}>Login</button>
      </div>
    </div>
  )
}