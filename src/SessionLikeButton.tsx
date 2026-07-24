import { useCallback, useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { supabase } from './supabase'

export function SessionLikeButton({sessionId, userId}:{
  sessionId:string; userId:string
}){
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async()=>{
    const [likedRes, countRes] = await Promise.all([
      supabase.rpc('is_session_liked', {p_session_id: sessionId}),
      supabase.from('session_likes').select('id', {count: 'exact', head: true}).eq('session_id', sessionId),
    ])
    setLiked(likedRes.data || false)
    setCount(countRes.count || 0)
    setLoading(false)
  }, [sessionId])

  useEffect(()=>{ load() }, [load])

  async function toggle(){
    const prev = liked
    const prevCount = count
    setLiked(!liked)
    setCount(liked ? count - 1 : count + 1)
    const {data} = await supabase.rpc('toggle_session_like', {p_session_id: sessionId})
    if(data){
      setLiked(data.liked)
      setCount(data.like_count)
    }else{
      setLiked(prev)
      setCount(prevCount)
    }
  }

  if(loading) return null

  return <button className={`session-like-btn ${liked?'liked':''}`} onClick={(e)=>{e.stopPropagation();toggle()}} aria-label={liked?'Unlike session':'Like session'}>
    <Heart size={13} fill={liked?'currentColor':'none'}/> {count > 0 ? count : ''}
  </button>
}
