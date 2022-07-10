export type GeneralStats = {
    services:number,
    closed:number,
    regexes:number
}

export type Service = {
    name:string,
    service_id:string,
    status:string,
    port:number,
    ipv6:boolean,
    n_packets:number,
    n_regex:number,
}

export type ServiceAddForm = {
    name:string,
    port:number,
    ipv6:boolean,
    internalPort?:number
}

export type ServiceAddResponse = {
    status: string,
    service_id?: string,
}

export type ServerResponse = {
    status:string
}

export type ServerResponseToken = {
    status:string,
    access_token?:string
}

export type LoginResponse = {
    status?:string,
    access_token:string,
    token_type:string
}

export type ServerStatusResponse = {
    status:string,
    loggined:boolean
}

export type PasswordSend = {
    password:string,
}

export type ChangePassword = {
    password:string,
    expire:boolean
}

export type RegexFilter = {
    id:number,
    service_id:string,
    regex:string
    is_blacklist:boolean,
    is_case_sensitive:boolean,
    mode:string //C S B => C->S S->C BOTH
    n_packets:number,
    active:boolean
}

export type RegexAddForm = {
    service_id:string,
    regex:string,
    is_case_sensitive:boolean,
    is_blacklist:boolean,
    mode:string, // C->S S->C BOTH,
    active: boolean
}