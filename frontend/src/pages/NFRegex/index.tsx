import { ActionIcon, Badge, Divider, LoadingOverlay, Space, Title, Tooltip } from '@mantine/core';
import { useEffect, useState } from 'react';
import { BsPlusLg } from "react-icons/bs";
import { useNavigate, useParams } from 'react-router-dom';
import ServiceRow from '../../components/NFRegex/ServiceRow';
import { nfregexServiceQuery } from '../../components/NFRegex/utils';
import { errorNotify, getErrorMessage, isMediumScreen } from '../../js/utils';
import AddNewService from '../../components/NFRegex/AddNewService';
import AddNewRegex from '../../components/AddNewRegex';
import { useQueryClient } from '@tanstack/react-query';
import { TbReload } from 'react-icons/tb';


function NFRegex({ children }: { children: any }) {

    const navigator = useNavigate()
    const [open, setOpen] = useState(false);
    const {srv} = useParams()
    const queryClient = useQueryClient()
    const [tooltipRefreshOpened, setTooltipRefreshOpened] = useState(false);
    const [tooltipAddServOpened, setTooltipAddServOpened] = useState(false);
    const [tooltipAddOpened, setTooltipAddOpened] = useState(false);
    const isMedium = isMediumScreen()
    const services = nfregexServiceQuery()

    useEffect(()=> {
        if(services.isError)
            errorNotify("NFRegex Update failed!", getErrorMessage(services.error))
    },[services.isError])

    const closeModal = () => {setOpen(false);}

    return <>
    <Space h="sm" />
    <div className={isMedium?'center-flex':'center-flex-row'}>
        <Title order={4}>Netfilter Regex</Title>
        {isMedium?<div className='flex-spacer' />:<Space h="sm" />}
        <div className='center-flex' >
            <Badge size="sm" color="green" variant="filled">Services: {services.isLoading?0:services.data?.length}</Badge>
            <Space w="xs" />
            <Badge size="sm" color="yellow" variant="filled">Filtered Connections: {services.isLoading?0:services.data?.reduce((acc, s)=> acc+=s.n_packets, 0)}</Badge>
            <Space w="xs" />
            <Badge size="sm" color="violet" variant="filled">Regexes: {services.isLoading?0:services.data?.reduce((acc, s)=> acc+=s.n_regex, 0)}</Badge>
            <Space w="xs" />
        </div>
        {isMedium?null:<Space h="md" />}
        <div className='center-flex' >
            { srv?
            <Tooltip label="Add a new regex" position='bottom' color="blue" opened={tooltipAddOpened}>
                <ActionIcon color="blue" onClick={()=>setOpen(true)} size="lg" radius="md" variant="filled"
                onFocus={() => setTooltipAddOpened(false)} onBlur={() => setTooltipAddOpened(false)}
                onMouseEnter={() => setTooltipAddOpened(true)} onMouseLeave={() => setTooltipAddOpened(false)}><BsPlusLg size={18} /></ActionIcon>
            </Tooltip>
            : <Tooltip label="Add a new service" position='bottom' color="blue" opened={tooltipAddOpened}>
                <ActionIcon color="blue" onClick={()=>setOpen(true)} size="lg" radius="md" variant="filled"
                onFocus={() => setTooltipAddOpened(false)} onBlur={() => setTooltipAddOpened(false)}
                onMouseEnter={() => setTooltipAddOpened(true)} onMouseLeave={() => setTooltipAddOpened(false)}><BsPlusLg size={18} /></ActionIcon>
            </Tooltip>
        }
        <Space w="xs" />
            <Tooltip label="Refresh" position='bottom' color="indigo" opened={tooltipRefreshOpened}>
                <ActionIcon color="indigo" onClick={()=>queryClient.invalidateQueries(["nfregex"])} size="lg" radius="md" variant="filled"
                loading={services.isFetching}
                onFocus={() => setTooltipRefreshOpened(false)} onBlur={() => setTooltipRefreshOpened(false)}
                onMouseEnter={() => setTooltipRefreshOpened(true)} onMouseLeave={() => setTooltipRefreshOpened(false)}><TbReload size={18} /></ActionIcon>
            </Tooltip>
        </div>
    </div>
    <Space h="md" />
    <Divider size="md" style={{width:"100%"}}/>
    <div id="service-list" className="center-flex-row">
        {srv?null:<>
            <LoadingOverlay visible={services.isLoading} />
            {(services.data && services.data?.length > 0)?services.data.map( srv => <ServiceRow service={srv} key={srv.service_id} onClick={()=>{
                navigator("/nfregex/"+srv.service_id)
            }} />):<><Space h="xl"/> <Title className='center-flex' order={3} style={{ textAlign: "center" }}>No services found! Add one clicking the "+" buttons</Title>
                <Space h="xl" /> <Space h="xl" /> 
                <div className='center-flex'>
                    <Tooltip label="Add a new service" color="blue" opened={tooltipAddServOpened}>
                        <ActionIcon color="blue" onClick={()=>setOpen(true)} size="xl" radius="md" variant="filled"
                            onFocus={() => setTooltipAddServOpened(false)} onBlur={() => setTooltipAddServOpened(false)}
                            onMouseEnter={() => setTooltipAddServOpened(true)} onMouseLeave={() => setTooltipAddServOpened(false)}><BsPlusLg size="20px" /></ActionIcon>
                    </Tooltip>
                </div>
            </>}
            <AddNewService opened={open} onClose={closeModal} />
        </>}
    </div>
    {srv?children:null}
    {srv?
        <AddNewRegex opened={open} onClose={closeModal} service={srv} />:
        <AddNewService opened={open} onClose={closeModal} />
    }
    </>
}

export default NFRegex;
