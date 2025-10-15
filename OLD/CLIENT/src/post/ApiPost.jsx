export const create = (userId,token,post) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/new/${userId}`,{
        method:'POST',
        headers: {
            Accept:'application/json',
            Authorization:`Bearer ${token}`
        },
        body:post
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
    
}

export const update = (postId,token,post) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/${postId}`,{
        method:'PUT',
        headers: {
            Accept:'application/json',
            Authorization:`Bearer ${token}`
        },
        body:post
    })
    .then(response =>{
        const res =  response.json();
        return res;
    })
    .catch(err => console.log(err))
    
}

export const remove = (postId ,token) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/${postId}`,{
        method:'DELETE',
        headers: {
            'Accept':'application/json',
            'Content-Type':'application/json',
            'Authorization':`Bearer ${token}`
        }
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
}



export const List = () =>{
    return fetch(`${process.env.REACT_APP_API_URL}/posts`,{
        method: 'GET',
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
}
export const ListByUser = (userId,token) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/posts/by/${userId}`,{
        method: 'GET',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            'Authorization':`Bearer ${token}`
        },
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
}

export const singlePost = (postId) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/${postId}`,{
        method: 'GET',
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
}
export const brace = (userId,token,postId) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/brace`,{
        method:'PUT',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            Authorization:`Bearer ${token}`
        },
        body: JSON.stringify({userId,postId})
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
    
}

export const unBrace = (userId,token,postId) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/unBrace`,{
        method:'PUT',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            Authorization:`Bearer ${token}`
        },
        body: JSON.stringify({userId,postId})
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
    
}

export const addCommentOne = (userId,token,postId,comment,emotion,color) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/comment`,{
        method:'PUT',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            Authorization:`Bearer ${token}`
        },
        body: JSON.stringify({userId,postId,comment,emotion,color})
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
    
}

export const unComment = (userId,token,postId,comment) =>{
    return fetch(`${process.env.REACT_APP_API_URL}/post/unComment`,{
        method:'PUT',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            Authorization:`Bearer ${token}`
        },
        body: JSON.stringify({userId,postId,comment})
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
    
}

export const feed = (userId,token,emotion,color)=>{
    return fetch(`${process.env.REACT_APP_API_URL}/feed`,{
        method: 'GET',
        headers: {
            Accept:'application/json',
            'Content-Type': 'application/json',
            Authorization:`Bearer ${token}`
        },
        body: JSON.stringify({userId,emotion,color})
    })
    .then(response =>{
        return response.json()
    })
    .catch(err => console.log(err))
};