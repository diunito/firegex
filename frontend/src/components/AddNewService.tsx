import { Button, Group, NumberInput, Space, TextInput, Notification, Modal, Switch } from '@mantine/core';
import { useForm } from '@mantine/hooks';
import React, { useState } from 'react';
import { addservice, fireUpdateRequest, okNotify, startservice } from '../js/utils';
import { ImCross } from "react-icons/im"

type ServiceAddForm = {
    name:string,
    port:number,
    autostart: boolean
}

function AddNewService({ opened, onClose }:{ opened:boolean, onClose:()=>void }) {

    const form = useForm({
        initialValues: {
            name:"",
            port:1,
            autostart: true
        },
        validationRules:{
            name: (value) => value !== ""?true:false,
            port: (value) => value>0 && value<65536
        }
    })

    const close = () =>{
        onClose()
        form.reset()
        setError(null)
    }

    const [submitLoading, setSubmitLoading] = useState(false)
    const [error, setError] = useState<string|null>(null)
 
    const submitRequest = ({ name, port, autostart }:ServiceAddForm) =>{
        setSubmitLoading(true)
        addservice({ name, port }).then( res => {
            if (res.status === "ok"){
                setSubmitLoading(false)
                close();
                fireUpdateRequest();
                if (autostart) startservice(res.id)
                okNotify(`Service ${name} has been added`, `Successfully added ${res.id} with port ${port}`)
            }else{
                setSubmitLoading(false)
                setError("Invalid request! [ "+res.status+" ]")
            }
        }).catch( err => {
            setSubmitLoading(false)
            setError("Request Failed! [ "+err+" ]")
        })
    }    


  return <Modal size="xl" title="Add a new service" opened={opened} onClose={close} closeOnClickOutside={false} centered>
    <form onSubmit={form.onSubmit(submitRequest)}>
            <TextInput
                label="Service name"
                placeholder="Challenge 01"
                {...form.getInputProps('name')}
            />
            <Space h="md" />

            <NumberInput
                placeholder="8080"
                min={1}
                max={65535}
                label="Service port"
                {...form.getInputProps('port')}
            />

            <Space h="md" />

            <Switch
                label="Auto-Start Service"
                {...form.getInputProps('autostart', { type: 'checkbox' })}
            />

            <Group position="right" mt="md">
                <Button loading={submitLoading} type="submit">Add Service</Button>
            </Group>

            <Space h="md" />
            
            {error?<>
            <Notification icon={<ImCross size={14} />} color="red" onClose={()=>{setError(null)}}>
                Error: {error}
            </Notification><Space h="md" /></>:null}
            
        </form>
    </Modal>

}

export default AddNewService;
