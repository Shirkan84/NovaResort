import { supabase } from '../supabase'

export type SessionSearchResult = {
  id:string;host_id:string;title:string;description:string;category:string;language:string;
  starts_at:string;ends_at:string;timezone:string;capacity:number;visibility:string;status:string;
  registration_deadline:string|null;session_type:string;price:number;currency:string;
  location:string|null;cover_image_url:string|null;
  host_name:string;host_avatar:string|null;host_verified:boolean;
  registered_count:number;is_full:boolean;room_status:string|null;total_count:number;
}

export type GlobalSearchResult = {
  entity_type:'session'|'podcast'|'healer';
  id:string;title:string;subtitle:string;description:string;image_url:string|null;
  badge:string|null;relevance:number;
}

export async function searchSessions(opts:{
  search_text?:string;category_filter?:string;language_filter?:string;
  session_type_filter?:string;status_filter?:string;upcoming_only?:boolean;
  sort_by?:string;page_limit?:number;page_offset?:number;
}={}):Promise<{data:SessionSearchResult[];total:number}>{
  const {data,error}=await supabase.rpc('search_sessions',{
    search_text:opts.search_text||'',category_filter:opts.category_filter||'all',
    language_filter:opts.language_filter||'all',session_type_filter:opts.session_type_filter||'all',
    status_filter:opts.status_filter||'all',upcoming_only:opts.upcoming_only||false,
    sort_by:opts.sort_by||'upcoming',page_limit:opts.page_limit||12,page_offset:opts.page_offset||0,
  })
  if(error)throw error
  const rows=(data as SessionSearchResult[])||[]
  const total=rows.length>0?rows[0].total_count:0
  return{data:rows,total}
}

export async function searchGlobal(search_text:string,limit:number=5):Promise<GlobalSearchResult[]>{
  if(!search_text.trim())return[]
  const {data,error}=await supabase.rpc('search_global',{search_text,page_limit:limit})
  if(error)throw error
  return(data as GlobalSearchResult[])||[]
}
