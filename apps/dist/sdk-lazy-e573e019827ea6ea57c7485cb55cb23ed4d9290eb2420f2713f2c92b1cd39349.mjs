export default {
  "artifact_version": 1,
  "noir_version": "1.0.0-rc.3+5a7ee9bf5ed8973076df7bb0d2b723024db09ae7",
  "hash": "12220884314506972000",
  "abi": {
    "abi_version": 1,
    "parameters": [
      {
        "name": "previous_kernel_public_inputs",
        "type": {
          "kind": "struct",
          "path": "types::abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs",
          "fields": [
            {
              "name": "constants",
              "type": {
                "kind": "struct",
                "path": "types::abis::tx_constant_data::TxConstantData",
                "fields": [
                  {
                    "name": "anchor_block_header",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::block_header::BlockHeader",
                      "fields": [
                        {
                          "name": "last_archive",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                            "fields": [
                              {
                                "name": "root",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "next_available_leaf_index",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "state",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::state_reference::StateReference",
                            "fields": [
                              {
                                "name": "l1_to_l2_message_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "partial",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::partial_state_reference::PartialStateReference",
                                  "fields": [
                                    {
                                      "name": "note_hash_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "nullifier_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "public_data_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "sponge_blob_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "tx_effects_tree_root",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "global_variables",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::global_variables::GlobalVariables",
                            "fields": [
                              {
                                "name": "chain_id",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "version",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "block_number",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "slot_number",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "timestamp",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 64
                                }
                              },
                              {
                                "name": "coinbase",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::eth_address::EthAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "fee_recipient",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "gas_fees",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "total_fees",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "total_mana_used",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "tx_context",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::transaction::tx_context::TxContext",
                      "fields": [
                        {
                          "name": "chain_id",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "version",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "gas_settings",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_settings::GasSettings",
                            "fields": [
                              {
                                "name": "gas_limits",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas::Gas",
                                  "fields": [
                                    {
                                      "name": "da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    },
                                    {
                                      "name": "l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "teardown_gas_limits",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas::Gas",
                                  "fields": [
                                    {
                                      "name": "da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    },
                                    {
                                      "name": "l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "max_fees_per_gas",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "max_priority_fees_per_gas",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "vk_tree_root",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "protocol_contracts_hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "end",
              "type": {
                "kind": "struct",
                "path": "types::abis::accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData",
                "fields": [
                  {
                    "name": "note_hashes",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "nullifiers",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "l2_to_l1_msgs",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                              "fields": [
                                {
                                  "name": "recipient",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::eth_address::EthAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "content",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "private_logs",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::log::Log",
                        "fields": [
                          {
                            "name": "fields",
                            "type": {
                              "kind": "array",
                              "length": 16,
                              "type": {
                                "kind": "field"
                              }
                            }
                          },
                          {
                            "name": "length",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "contract_class_logs_hashes",
                    "type": {
                      "kind": "array",
                      "length": 1,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::log_hash::LogHash",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "length",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            },
            {
              "name": "gas_used",
              "type": {
                "kind": "struct",
                "path": "types::abis::gas::Gas",
                "fields": [
                  {
                    "name": "da_gas",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  },
                  {
                    "name": "l2_gas",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "fee_payer",
              "type": {
                "kind": "struct",
                "path": "types::address::aztec_address::AztecAddress",
                "fields": [
                  {
                    "name": "inner",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "expiration_timestamp",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 64
              }
            }
          ]
        },
        "visibility": "databus"
      },
      {
        "name": "previous_kernel_vk_data",
        "type": {
          "kind": "struct",
          "path": "types::proof::vk_data::VkData",
          "fields": [
            {
              "name": "vk",
              "type": {
                "kind": "struct",
                "path": "types::proof::verification_key::VerificationKey",
                "fields": [
                  {
                    "name": "key",
                    "type": {
                      "kind": "array",
                      "length": 151,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "leaf_index",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "sibling_path",
              "type": {
                "kind": "array",
                "length": 7,
                "type": {
                  "kind": "field"
                }
              }
            }
          ]
        },
        "visibility": "private"
      }
    ],
    "return_type": {
      "abi_type": {
        "kind": "struct",
        "path": "types::abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs",
        "fields": [
          {
            "name": "constants",
            "type": {
              "kind": "struct",
              "path": "types::abis::tx_constant_data::TxConstantData",
              "fields": [
                {
                  "name": "anchor_block_header",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::block_header::BlockHeader",
                    "fields": [
                      {
                        "name": "last_archive",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                          "fields": [
                            {
                              "name": "root",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "next_available_leaf_index",
                              "type": {
                                "kind": "field"
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "state",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::state_reference::StateReference",
                          "fields": [
                            {
                              "name": "l1_to_l2_message_tree",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                "fields": [
                                  {
                                    "name": "root",
                                    "type": {
                                      "kind": "field"
                                    }
                                  },
                                  {
                                    "name": "next_available_leaf_index",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "partial",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::partial_state_reference::PartialStateReference",
                                "fields": [
                                  {
                                    "name": "note_hash_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "nullifier_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "public_data_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "sponge_blob_hash",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "tx_effects_tree_root",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "global_variables",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::global_variables::GlobalVariables",
                          "fields": [
                            {
                              "name": "chain_id",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "version",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "block_number",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 32
                              }
                            },
                            {
                              "name": "slot_number",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "timestamp",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 64
                              }
                            },
                            {
                              "name": "coinbase",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::eth_address::EthAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "fee_recipient",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::aztec_address::AztecAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "gas_fees",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "total_fees",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "total_mana_used",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "tx_context",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::transaction::tx_context::TxContext",
                    "fields": [
                      {
                        "name": "chain_id",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "version",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "gas_settings",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::gas_settings::GasSettings",
                          "fields": [
                            {
                              "name": "gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "teardown_gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_priority_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "vk_tree_root",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "protocol_contracts_hash",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "end",
            "type": {
              "kind": "struct",
              "path": "types::abis::accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData",
              "fields": [
                {
                  "name": "note_hashes",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "field"
                    }
                  }
                },
                {
                  "name": "nullifiers",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "field"
                    }
                  }
                },
                {
                  "name": "l2_to_l1_msgs",
                  "type": {
                    "kind": "array",
                    "length": 8,
                    "type": {
                      "kind": "struct",
                      "path": "types::side_effect::scoped::Scoped",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "struct",
                            "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                            "fields": [
                              {
                                "name": "recipient",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::eth_address::EthAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "content",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "contract_address",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "name": "private_logs",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::log::Log",
                      "fields": [
                        {
                          "name": "fields",
                          "type": {
                            "kind": "array",
                            "length": 16,
                            "type": {
                              "kind": "field"
                            }
                          }
                        },
                        {
                          "name": "length",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "name": "contract_class_logs_hashes",
                  "type": {
                    "kind": "array",
                    "length": 1,
                    "type": {
                      "kind": "struct",
                      "path": "types::side_effect::scoped::Scoped",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::log_hash::LogHash",
                            "fields": [
                              {
                                "name": "value",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "length",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "contract_address",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          },
          {
            "name": "gas_used",
            "type": {
              "kind": "struct",
              "path": "types::abis::gas::Gas",
              "fields": [
                {
                  "name": "da_gas",
                  "type": {
                    "kind": "integer",
                    "sign": "unsigned",
                    "width": 32
                  }
                },
                {
                  "name": "l2_gas",
                  "type": {
                    "kind": "integer",
                    "sign": "unsigned",
                    "width": 32
                  }
                }
              ]
            }
          },
          {
            "name": "fee_payer",
            "type": {
              "kind": "struct",
              "path": "types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "expiration_timestamp",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 64
            }
          }
        ]
      },
      "visibility": "public"
    },
    "error_types": {
      "7132025627426189893": {
        "error_kind": "string",
        "string": "Field failed to decompose into specified 7 limbs"
      },
      "12107089946950716685": {
        "error_kind": "string",
        "string": "previous kernel must be a private_kernel_reset_tail variant"
      },
      "13451820477104772980": {
        "error_kind": "string",
        "string": "Membership check failed: vk hash not found in vk tree"
      }
    }
  },
  "bytecode": "H4sIAAAAAAAA/+3dZbgcVbr28dRaq5bhwTXB3YJ7FAgQCAluIUYIxNgRCB7ciRFcozgES3DXupHgENwdgvvbM+ecoQ5nZrhhuN9PzIe5nivzdP27uyrs3dVz8bOjR42b0L973wEzy1NGXNO2X/ee+7cdeNDmQwf0bNe9X78RE7u02XaLDqNHTN6575ABvQcPnrMlsTR3a2Jp3upIYms+amth5lktwiwtyiwtxiwtTj3zJaitFtRWS2qreoR59tVMausjausnZgvFXNxaS25tTW6tLbfWlVvrxa0N5daO49bO5NamcGvTubWHubUXubUPubUfqTUzJ7fWgltbg1trw6114dZ6cmtDuLVjubVx3Npkbm0at/YQt/YCt/YBt/YDtWbn4NaW4NZW59Zac2vbc2s9uLXB3Nox3NoZ3Nokbu0mbu1Bbu15bu19bu17as3Nzq0tzq2txq1txq115ta6c2tN3NrR3NpYbm0it3Yjt/YAt/Yct/Yet/Ydt8b9g8txv3G5n6m1smhNrZ3zz452fZfePYc2De47rHebPn2aevfpPqTvwAHjZjY7s/ZAU5ttbXa1uazNvjaH2hxrc6rNuTbPVptnr81z1OY5a/NctXnu2jxPbW5em+etzfPV5vlr8wK1ecHavFBtXrg2L1KbF63Ni9XmxWvzErW5RW1uWZuXrM1L1eala/MytXnZ2rxcbV6+Nq9Qm1eszSvV5pVr8yq1edXavFptXr02r1Gb16zNrWrzWrV57dq8Tm1etzavV5vXr80b1OYNa/NGtXnj2rxJbd60Nm9Wm1vX5ja1uW1tbleb29fmDrV589q8RW3esjZ3rM1b1eata/M2tblTbd62Nm9XmzvX5u1rc5fa3LU271Cbd6zNO9XmnWvzLrV519q8W23evTbvUZv3rM171eZutXnv2ty9NveozT1rc6/a3Ls271Ob+9TmfWtz39q8X23evzb3q839a/OA2jywNg+qzQfU5qbaPLg2D6nNQ2vzsNp8YG0+qDYPr80H1+ZDavOhtfmw2nx4bT6iNh9Zm0fU5qNq89G1+ZjafGxtPq42H1+bT6jNJ9bmk2rzybX5lNp8am0+rTafXptH1uZRtbn+Q3BMbR5bm8+ozeNqc/3n4Fkj64Wzw4gp7QYOGDyk+4Ah97Zs9u//U4y4vG1T3379+vb520/dsc1Gj5jUte+APv16jxk5avRvP7rxw/vfL/3888+v/XLIkf92ufjbf/39CfQf1K838oRfxom/9dj/ei3Ebxu58TvfZW0GD+7dNGS33k0Dx4wcw73MxtYavbZtem3Ni1ac1rnDjSNG7LLnCmu9u+Xw6YNGtXvty9Gf/m0rT/j3W2MaW80az4B4y+Rn5cU/elYm/TJO/vPOymThWZlEnZXJxFv2v57iKOqwk37zdTT7I4ed8Hv/Zhdj/uRr6O/PnLyG/vaf8HuWzagRE9s0NXUffibyFORLkS9Dvhz5CuQrka/68667KdzapdzaZdza5dzaFdzaldzaVcX/vs7O+jP+hv331TjlN7Y+afztabyJv731Y+M9/O2tbxtv4W9vfdZ4B39767XGG/jbW3c13j/NX+Sr//1hr31go+7/67CjxhBHLc9unBOu/9LvfFl/6zf7zcvmXLr/8u99W8dS1+3ZVPwa5lj5JWpL9ELOpV7Itdy51pwR7kRP/ZeHtf847D+5DdR54ODefXsNHNCqc++m/kOH/P020OjaL8j56tp8TW2+tjZPHYt8HfL1yDcg3/gHrufzGv/04l7mK3/g79NvH7XxA/A6rv+q5DLM11Hxm6hjvUJtaV5IeR71QqZx5/pPOyP/6YV/U22e9qsLfzryzci3IN/6By788xs/kLkL7zXJhd/4tW86139dc+FPp+K3Ucd6jdrSvJDyfOqF3M6d6z/tjPynF/5ttfn2X134dyDfidz41e3uP3DhX9D4HZO78N6QXPiNDzt3cP03NRf+HVT8HupYb1BbmhdSXkC9kHu5c/2nnZH/9MK/pzbf+6sL/z7k+5EfQH7wD1z4FzY+NnEX3luSC7/xEf8+rv+25sK/j4o/RB3rLWpL80LKC6kX8jB3rv+0M/KfXvgP1eaHf3XhP4JcIQP50T9w4V/UuBPAXXjvSC78xo2tR7j+u5oL/xEq/hh1rHeoLc0LKS+iXsjj3Ln+087If3rhP1abH//Vhf8E8gzkJ5Gf+gMX/sWNm1vchfee5MK/qvH8uf77mgv/CSr+NHWs96gtzQspL6ZeyDPcuf7Tzsh/euE/XZuf+dWF/yzyc8jPI7/wv9+v0cSzX5I6Vc/+3lPFpJtRp/MSRbqg0uMVaUOlJyjSlkpPVKQdlZ6kSJdUerIi7an0FEU6UOlLFelIpS9TpBOVvlyRzlT6CkV6Nip9pSI9O5W+SpGeg0pfrUjPSaWvUaTnotLXKtJzU+mpivQ8VPo6Rbo5lb5ekZ6XSt+gSM9HpW9UpOen0jcp0gtQ6WmK9IJUeroivRCVvlmRXphK36JIL0Klb1WkF6XStynSi1Hp2xXpxan0HYr0ElT6TkW6BZW+S5FuSaXvVqSpuwrlPYr0UlT6XkV6aSp9nyK9DJW+X5Felko/oEgvR6UfVKSXp9IPKdIrUOmHFekVqfQjivRKVLpSpFem0lCkV6HSjyrSq1LpxxTp1aj044r06lT6CUV6DSo9Q5Fek0o/qUi3otJPKdJrUemnFem1qfQzivQ6VFryjc+6VPo5RXo9Kv28Ir0+lX5Bkd6ASr+oSG9IpWcq0htR6ZcU6Y2p9MuK9CZU+hVFelMq/aoivRmVfk2Rbk2lX1ek21DpNxTptlT6TUW6HZV+S5FuT6XfVqQ7UOl3FOnNqfS7ivQWVPo9RXpLKv2+It2RSn+gSG9FpT9UpLem0h8p0ttQ6Y8V6U5U+hNFelsq/akivR2V/kyR7kylZynS21PpzxXpLlT6C0W6K5X+UpHegUp/pUjvSKW/VqR3otLfKNI7U+lvFeldqPR3ivSuVPp7RXo3Kv2DIr07lf5Rkd6DSv+kSO9JpX9WpPdi0r6ZIt2NSheK9N5U2ijS3am0VaR7UGmnSPek0qUi3YtKe0W6N5UOivQ+VDoq0n2odFKk96XSWZHuS6VnU6T3o9KzK9L7U+k5FOl+VHpORbo/lZ5LkR5ApedWpAdS6XkU6UFUurkifQCVnleRbqLS8ynSg6n0/Ir0ECq9gCI9lEovqEgPo9ILKdIHUumFFemDqPQiivRwKr2oIn0wlV5MkT6ESi+uSB9KpZdQpA+j0i0U6cOpdEtF+ggqvaQiXR1JtZeStEdQ7aUl7aOo9jKS9tFUe1lJ+xiqvZykfSzVXl7SPo5qryBpH0+1V5S0T6DaK0naJ1LtlSXtk6j2KpL2yVR7VUn7FKq9mqR9KtVeXdI+jWqvIWmfTrXXlLRHUu1Wkjb1r8/3a0nao6n22pI2ZTL4dSRt6t9/5NeVtM+g2utJ2uOo9vqS9plUewNJm9IJ/IaS9tlUeyNJ+xyqvbGkfS7V3kTSPo9qbyppn0+1N5O0L6DarSXtC6l2G0n7IqrdVtK+mGq3k7QvodrtJe3xVLuDpD2Bam8uaU+k2ltI2pOo9paS9mSq3VHSnkK1t5K0L6XaW0val1HtbSTty6l2J0n7Cqq9raR9JdXeTtK+imp3lrSvptrbS9qUnOS7SNrXUu2ukvZUqr2DpH0d1d5R0r6eau8kad9AtXeWtG+k2rtI2pSm5HeVtKdR7d0k7elUe3dJ+2aqvYekfQvV3lPSvpVq7yVpU3iS7yZp306195a076Da3SXtO6l2D0n7LqrdU9K+m2r3krQpK8n3lrTvpdr7SNr3Ue0+kvb9VHtfSfsBqt1X0n6Qau8naVM0kt9f0n6YaveTtB+h2v0l7YpqD5C0QbUHStqPUu1BkjYlIfkDJO3HqXaTpP0E1R4sac+g2kMk7Sep9lBJ+ymqPUzSpuAjf6Ck/QzVPkjSfpZqD5e0n6PaB0vaz1PtQyTtF6j2oZL2i1T7MEl7JtU+XNKmfHt/hKT9MtU+UtKmHHI/QtJ+lWofJWlTDLU/WtJ+nWofI2lTCrE/VtJ+k2ofJ2lTCK0/XtJ+m2qfIGlTBqk/UdJ+l2qfJGlTBKU/WdJ+n2qfIml/QLVPlbQ/pNqnSdofUe3TJe2PqfZISfsTqj1K0v6Uao+WtD+j2mMk7VlUe6yk/TnVPkPS/oJqj5O0v6TaZ0raX1HtsyTtr6n22ZL2N1T7HEn7W6p9rqT9HdU+T9L+nmqfL2n/QLUvkLR/pNoXSto/Ue2LJO2fqfbFijYKSuD2l2jilMHtx2vilMLtJ2jilMPtJ2rilMTtJ2nilMXtJ2vilMbtp2jilMftL9XEKZHbX6aJUya3v1wTp1Ruf4UmTrnc/kpNnJK5/VWaOGVz+6s1cUrn9tdo4pTP7a/VxCmh20/VxCmj21+niTen4tdr4pTT7W/QxCmp29+oiVNWt79JE6e0bj9NE6e8bj9dE6fEbn+zJk6Z3f4WTZxSu/2tmjjldvvbNHFK7va3a+KU3e3v0MQpvdvfqYlTfre/SxOnBG9/tyZOGd7+Hk2cUrz9vZo45Xj7+zRxSvL292vilOXtH9DEKc3bP6iJU563f0gTp0Rv/7AmTpne/hFNnFK9faWJU663hyZOyd7+UU2csr39Y5o4pXv7xzVxyvf2T2jilPDtZ2jilPHtn9TEW1HxpzRxyvn2T2vilPTtn9HEKevbP6uJU9q3f04Tp7xv/7wmTonf/gVNnDK//YuaOKV++5maOOV++5c0cUr+9i9r4pT97V/RxCn927+qiVP+t39NE6cEcP+6Jk4Z4P4NTZxSwP2bmjjlgPu3NHFKAvdva+KUBe7f0cQpDdy/q4lTHrh/TxOnRHD/viZOmeD+A02cUsH9h5o45YL7jzRxSgb3H2vilA3uP9HEKR3cf6qJUz64/0wTp4RwP0sTp4xw/7km3oWKf6GJU064/1ITp6Rw/5UmTlnh/mtNnNLC/TeaOOWF+281cUoM999p4pQZ7r/XxCk13P+giVNuuP9RE6fkcP+TJk7Z4f5nTZzSw0MzTZzyw0OhiVOCeDCaOGWIB6uJU4p4cJo45YiHUhOnJPHgNXHKEg9BE6c08RA1ccoTD0kTp0TxkDVxyhQPs2nilCoeZtfEKVc8zKGJU7J4mFMTp2zxMJcmTuniYW5NnPLFwzyaOCWMh+aaOGWMh3k18SYqPp8mTjnjYX5NnJLGwwKaOGWNhwU1cUobDwtp4pQ3HhbWxClxPCyiiVPmeFhUE6fU8bCYJk6542FxTZySx8MSmjhlj4cWmjilj4eWmjjlj4clNXEKIA9LaeKUQB6W1sQpgjwso4lTBnlYVhOnEPKwnCZOKeRheU2cYsjDCpo45ZCHFTVxCiIPK2nilEQeVtbEKYo8rKKJUxZ5WFUTpzDysJomTmnkYXVNnOLIwxqaOOWRhzU1cQokD600cUokD2tp4qOp+NqaOGWSh3U0cQolD+tq4pRKHtbTxCmWPKyviVMuedhAE6dg8rChJk7J5GEjTZyiycPGmjhlk4dNNHEKJw+bauKUTh4208Qpnjy01sQpnzy00cQpoDy01cQpoTy008Qpojy018Qpozx00MQppDxsrolTSnnYQhOnmPKwpSZOOeWhoyZOQeVhK02cksrD1po4RZWHbTRxyioPnTRxCisP22rilFYettPEKa48dNbEKa88bK+JU2B56KKJU2J56KqJT6XiO2jilFkedtTEKbQ87KSJU2p52FkTp9jysIsmTrnlYVdNnILLw26aOCWXh901cYouD3to4pRdHvbUxCm8POyliVN6eeimiVN8edhbE6f88tBdE6cA89BDE6cE89BTE6cI89BLE6cM89BbE6cQ87CPJk4p5qGPJk4x5mFfTZxyzENfTZyCzMN+mjglmYf9NXGKMg/9NHHKMg/9NXEKMw8DNHFKMw8DNXGKMw+DNHHKMw8HaOIUaB6aNHFKNA+DNfEZVHyIJk6Z5mGoJk6h5mGYJk6p5uFATZxizcNBmjjlmofhmjgFm4eDNXFKNg+HaOIUbR4O1cQp2zwcpolTuHk4XBOndPNwhCZO8ebhSE2c8s3DCE2cAs7DUZo4JZyHozVxijgPx2jilHEejtXEKeQ8HKeJU8p5OF4Tp5jzcIImTjnn4URNnILOw0maOCWdh5M1cYo6D6do4pR1Hk7VxCnsPJymiVPaeThdE6e48zBSE6e88zBKE6fAc0J6/ENxSjwPYzTxWVR8rCZOmefhDE2cQs/DOE2cUs/DmZo4xZ6HszRxyj0PZ2viFHweztHEKfk8nKuJU/R5OE8Tp+zzcL4mTuHn4QJNnNLPw4WaOMWfh4s0cco/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+eZiqiVP+edD456Y5Fdf454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnYYYmTvnnQeOfm1ZUXOOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z+HWZo45Z8HjX9uulBxjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edD454byz4PGPzeUfx40/rmh/POg8c8N5Z8HjX9uKP88aPxzQ/nnQeOfG8o/Dxr/3FD+edT454byz6PGPzeUfx41/rmh/POo8c8N5Z9HjX9uKP88avxzQ/nnUeOfG8o/jxr/3FD+edT454byz6PGPzeUfx41/rmh/POo8c8N5Z9HjX9uKP88avxzQ/nnUeOfG8o/jxr/3FD+edT454byz6PGPzeUfx6ba+KUfx41/rlpouIa/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PLbSxCn/PGr8czOaimv8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzz2EUTp/zzqPHPzVQqrvHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s9jkyZO+edR45+bGVRc458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3lnxPY4h+KU/551PjnZhYV1/jnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edxqiZO+edR45/b5lRc459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln8cZmjjln0eNf25bUXGNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/Hmdp4pR/HjX+ue1CxTX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edJ459byj9PGv/cUv550vjnlvLPk8Y/t5R/njT+uaX886Txzy3lnyeNf24p/zxp/HNL+edJ459byj9PGv/cUv550vjnlvLPk8Y/t5R/njT+uaX886Txzy3lnyeNf24p/zxp/HNL+edJ459byj9PGv/cUv55aq6JU/550vjntomKa/xzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/PPUShOn/POk8c/taCqu8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz1MXTZzyz5PGP7dTqbjGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/T02aOOWfJ41/bmdQcY1/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH9OeId/KE7550njn9tZVFzjn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPHeWfJ41/7ij/PGn8c0f550njnzvKP08a/9xR/nnS+OeO8s+Txj93lH+eNP65o/zzpPHPHeWfJ41/7ij/PGn8c0f550njnzvKP08a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",
  "debug_symbols": "",
  "file_map": {},
  "verificationKey": {
    "bytes": "0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000051e00000000000000000000000000000000000000000000000000000000000002db000000000000000000000000000000e1960eef0b3159d536198c1e2e7fb87abd000000000000000000000000000000000003f6e212a61bd53b1ecf1791c6ab71000000000000000000000000000000d1f4801b17afdb6a28bdc1d1a6cbb2f2e000000000000000000000000000000000001ba02bbdfe482eac6aa8f9075dfe59000000000000000000000000000000bf247b6b85dfe31e9e6b140f01459bd73000000000000000000000000000000000001c5bec77c4e996f3a88ea4e711c26a0000000000000000000000000000005fd898fbedd57246d1a1c12a6b0d510dc200000000000000000000000000000000001477c1eabc5ad4abaaefe2a5b8dfbc000000000000000000000000000000db6372ade9535e30975e11476a76d12eb0000000000000000000000000000000000028c55d03c45ae69c28cd5c8e041e82000000000000000000000000000000290fa7fc695a3047d5947f2c60247c6a150000000000000000000000000000000000162afa6d2ea8da0f7ec77bf4444f75000000000000000000000000000000368bb5d3a7e9ec9b677a85c8a1d07cebae00000000000000000000000000000000000c70457ec67799938f586f72b223a9000000000000000000000000000000284241cec7eb7f81bdbe7690ebd1cd4c0500000000000000000000000000000000002db8fff6f9070840bf476a8eddcfed000000000000000000000000000000473d515c932a9391d8041d242072cba26d000000000000000000000000000000000011d7b58598ad47f993a112359da4aa000000000000000000000000000000eddfeb3eee8aa282c84a89119c0eaa816d000000000000000000000000000000000018559b670e6011865b6b43f1c91bb70000000000000000000000000000006c0d2c48526809674e4bbc3cdcdf0e8c6c00000000000000000000000000000000000deb5a89f36e4863e615fae66d37980000000000000000000000000000000422f8f006f9399045f8148a62efa13ed2000000000000000000000000000000000001ddd8b1c10ad06c519f1d340f42f2000000000000000000000000000000d16d6fba9ee14193b0e32541418c41fb08000000000000000000000000000000000007c6bfd32a1e0eb4a9eec26640e0730000000000000000000000000000002c71867b16683b7a05a577a83a4bd84baa00000000000000000000000000000000001c2697a9ae602f8a018ac977ac9495000000000000000000000000000000cfb2551f150087ad30c5f04fac2a74758a00000000000000000000000000000000001b676d40f2eb99001ee39c70cb8e9f0000000000000000000000000000008dd09800315703835d080d5582bec8a1ad00000000000000000000000000000000000fb73912b7660963e724b4622512c300000000000000000000000000000080cfa94f54e9c924669a5b7fbd558fe21900000000000000000000000000000000001c5aa1a02d7dc5a7aa03b363fa03ef0000000000000000000000000000003ae41a92a19cb1578b5a1a57d1d3d9cb18000000000000000000000000000000000024a8e4dfe2bdec3be5f92baa07b1700000000000000000000000000000002a7eb603620c5cb1156ecce48f08fd7fbb000000000000000000000000000000000002c404a4fbf0c0c3448c24a057a7d3000000000000000000000000000000f35b3d38227a876cedfba473bca1b2a7ae00000000000000000000000000000000001d2f38f133aa04394a22bfecbfb99400000000000000000000000000000023f5b6276ffae7154fb0309b67d02d1557000000000000000000000000000000000019388d886406b464f6f32a19df7bca0000000000000000000000000000000b70a07c230287766837f9e6af431b4ffc00000000000000000000000000000000001c193c043d50c4df4bf739dba351560000000000000000000000000000000ca5dc2016987f9656bef158a5c3a982bf000000000000000000000000000000000008e9406e6ef1e852dbea5c6fc05ce200000000000000000000000000000090dba0a479e881588544b18ad16fe6f37300000000000000000000000000000000000a408593fd266aefe53d9f106f4b66000000000000000000000000000000f64b6aae578a800d38e3d7ca131e4122f100000000000000000000000000000000000beb2998f415c1b5ac31b79638f67f0000000000000000000000000000009eefeb484608dd030f17956fe8d46e1a6e00000000000000000000000000000000002fd6fc0e3e4e281b8460cfd014108e000000000000000000000000000000121df23aed1d9750ddf96a008b57e08a8600000000000000000000000000000000001645caeefbdc03a8fa90b07f59eaf7000000000000000000000000000000ba3b46d0d6135f7496534698caed750ddc000000000000000000000000000000000007bd3f53b227c806e59a31c6a475db000000000000000000000000000000f9f21a874499b5ec15c5ca6fc09025f38f00000000000000000000000000000000001f94fca73ebbecfb17f88f1baf73ac000000000000000000000000000000f015589c09cc84b00025ef9c028c7d708b00000000000000000000000000000000002c0c4231faea0006e497493e77c39a0000000000000000000000000000009b3e9403dee4049bdca4aba23d6e79da7f00000000000000000000000000000000001adcfc13fb44f5c9dbbbff5baefe35000000000000000000000000000000e16b641d4886cc5ab42f1dc707d1ecd686000000000000000000000000000000000008fd028a84b09c26869c185eed0bef0000000000000000000000000000001eee81b23a887f299049b14c11e98460d600000000000000000000000000000000002a56ce41f6b0be13b9c26747621b82000000000000000000000000000000d5827d6338c78656c0d12ca1aea6ef2c7c00000000000000000000000000000000001aa98f2de3ddda547d8f6de4e725de00000000000000000000000000000076b7d560f82531be5eb7095e7745909b4000000000000000000000000000000000001c5c2ff5c32acb1c39c3adcca023a00000000000000000000000000000008babcb12c5d79845a0686ca78cc2de95db000000000000000000000000000000000002203bccc772016c50fab3739d9260000000000000000000000000000000d87346165b48085b6c23aacf6f425d60540000000000000000000000000000000000266218520b22c1091090a55dab05dd0000000000000000000000000000002e0a57f38c313a2a63fd67feccc35ece73000000000000000000000000000000000016bd438c544c670b8b853ae47913fc0000000000000000000000000000000f7ba94963bec143a0f52f572da28074bc0000000000000000000000000000000000190981400d3732f5370af74a117889000000000000000000000000000000f009248f998113a91720600261621462e8000000000000000000000000000000000006afadda4b159da16f5918bdb1739200000000000000000000000000000073a5e7a42c43f27b903d06835f5ec817b90000000000000000000000000000000000097c961841173ddc02a8d07ed9ccb800000000000000000000000000000045201617079c73c4c3e03532fb667555ca00000000000000000000000000000000000c545b0c65be5ff8315f2b3ea8885d0000000000000000000000000000006dbee5472d173f4952ee3cdf2931f1113a00000000000000000000000000000000001a11b75f9bb0e1ec84d82852e39a980000000000000000000000000000006fa74a5986c42a2aec0bedf16a29697de30000000000000000000000000000000000034ce8365af06b4f1ec8d7420af6c4000000000000000000000000000000e2c8585fde1810fbaa77bbbe2dd56d41d40000000000000000000000000000000000296114e0a756b5d5cd7e46e2695e51000000000000000000000000000000c4fc22fafd30a41a4a26fb95d60484fbea000000000000000000000000000000000023d2914b6223bf5b44c6782f394a2900000000000000000000000000000086d3143829ea88a0d6f4b4b760e14ab02900000000000000000000000000000000000c2bb9b83fbabeb075a21e7eecf6d8000000000000000000000000000000175f07fc4313ce41e7ef4d41ae013f5e1100000000000000000000000000000000001c657e29b1b955b8932ec2499d75f00000000000000000000000000000007f96d77047774b199ae3a2883be22056a400000000000000000000000000000000000dc23823e29ef492b1f5c8dad1c8580000000000000000000000000000005206653c44cfe4b70f74540f0b36cbf3de000000000000000000000000000000000007df9f6c57efdf4f8c756716ab497100000000000000000000000000000084a3a2236ae716d15b7f231c3b112c11d800000000000000000000000000000000002fc195a00975bb1e104315fde74fba0000000000000000000000000000001fb188950a9042501dea9c5e41249f048e00000000000000000000000000000000000a2dcdd0ecc684d8f223108fe76f360000000000000000000000000000006e0c6294c6fef9364a51663f232e87b16400000000000000000000000000000000001aa9cd3d3a2702773b075bc0a41ed200000000000000000000000000000043e69420e32ad158ddc4f780c5ec450170000000000000000000000000000000000023236a0c4e5b2fa087623103946e6d000000000000000000000000000000a87e61ca1ef85e4334b3d3424f4fd04ce800000000000000000000000000000000000c930be988435b62bb59368a3d5438000000000000000000000000000000ae32864153b3216c79449dbfa1ef1ebc21000000000000000000000000000000000025d638a3e0727f5b27c2185c591da0000000000000000000000000000000e36d2c23ee852a9f8c584161b263d3561e00000000000000000000000000000000000a14c0104de42fab8a8a2348484b400000000000000000000000000000006a13811447b3bc24db7850eae7cf5452b3000000000000000000000000000000000002f8a055f16e97138464454e022aac",
    "fields": [
      "0x0000000000000000000000000000000000000000000000000000000000000010",
      "0x000000000000000000000000000000000000000000000000000000000000051e",
      "0x00000000000000000000000000000000000000000000000000000000000002db",
      "0x000000000000000000000000000000e1960eef0b3159d536198c1e2e7fb87abd",
      "0x000000000000000000000000000000000003f6e212a61bd53b1ecf1791c6ab71",
      "0x000000000000000000000000000000d1f4801b17afdb6a28bdc1d1a6cbb2f2e0",
      "0x00000000000000000000000000000000001ba02bbdfe482eac6aa8f9075dfe59",
      "0x000000000000000000000000000000bf247b6b85dfe31e9e6b140f01459bd730",
      "0x00000000000000000000000000000000001c5bec77c4e996f3a88ea4e711c26a",
      "0x0000000000000000000000000000005fd898fbedd57246d1a1c12a6b0d510dc2",
      "0x00000000000000000000000000000000001477c1eabc5ad4abaaefe2a5b8dfbc",
      "0x000000000000000000000000000000db6372ade9535e30975e11476a76d12eb0",
      "0x000000000000000000000000000000000028c55d03c45ae69c28cd5c8e041e82",
      "0x000000000000000000000000000000290fa7fc695a3047d5947f2c60247c6a15",
      "0x0000000000000000000000000000000000162afa6d2ea8da0f7ec77bf4444f75",
      "0x000000000000000000000000000000368bb5d3a7e9ec9b677a85c8a1d07cebae",
      "0x00000000000000000000000000000000000c70457ec67799938f586f72b223a9",
      "0x000000000000000000000000000000284241cec7eb7f81bdbe7690ebd1cd4c05",
      "0x00000000000000000000000000000000002db8fff6f9070840bf476a8eddcfed",
      "0x000000000000000000000000000000473d515c932a9391d8041d242072cba26d",
      "0x000000000000000000000000000000000011d7b58598ad47f993a112359da4aa",
      "0x000000000000000000000000000000eddfeb3eee8aa282c84a89119c0eaa816d",
      "0x000000000000000000000000000000000018559b670e6011865b6b43f1c91bb7",
      "0x0000000000000000000000000000006c0d2c48526809674e4bbc3cdcdf0e8c6c",
      "0x00000000000000000000000000000000000deb5a89f36e4863e615fae66d3798",
      "0x0000000000000000000000000000000422f8f006f9399045f8148a62efa13ed2",
      "0x000000000000000000000000000000000001ddd8b1c10ad06c519f1d340f42f2",
      "0x000000000000000000000000000000d16d6fba9ee14193b0e32541418c41fb08",
      "0x000000000000000000000000000000000007c6bfd32a1e0eb4a9eec26640e073",
      "0x0000000000000000000000000000002c71867b16683b7a05a577a83a4bd84baa",
      "0x00000000000000000000000000000000001c2697a9ae602f8a018ac977ac9495",
      "0x000000000000000000000000000000cfb2551f150087ad30c5f04fac2a74758a",
      "0x00000000000000000000000000000000001b676d40f2eb99001ee39c70cb8e9f",
      "0x0000000000000000000000000000008dd09800315703835d080d5582bec8a1ad",
      "0x00000000000000000000000000000000000fb73912b7660963e724b4622512c3",
      "0x00000000000000000000000000000080cfa94f54e9c924669a5b7fbd558fe219",
      "0x00000000000000000000000000000000001c5aa1a02d7dc5a7aa03b363fa03ef",
      "0x0000000000000000000000000000003ae41a92a19cb1578b5a1a57d1d3d9cb18",
      "0x000000000000000000000000000000000024a8e4dfe2bdec3be5f92baa07b170",
      "0x0000000000000000000000000000002a7eb603620c5cb1156ecce48f08fd7fbb",
      "0x000000000000000000000000000000000002c404a4fbf0c0c3448c24a057a7d3",
      "0x000000000000000000000000000000f35b3d38227a876cedfba473bca1b2a7ae",
      "0x00000000000000000000000000000000001d2f38f133aa04394a22bfecbfb994",
      "0x00000000000000000000000000000023f5b6276ffae7154fb0309b67d02d1557",
      "0x000000000000000000000000000000000019388d886406b464f6f32a19df7bca",
      "0x0000000000000000000000000000000b70a07c230287766837f9e6af431b4ffc",
      "0x00000000000000000000000000000000001c193c043d50c4df4bf739dba35156",
      "0x0000000000000000000000000000000ca5dc2016987f9656bef158a5c3a982bf",
      "0x000000000000000000000000000000000008e9406e6ef1e852dbea5c6fc05ce2",
      "0x00000000000000000000000000000090dba0a479e881588544b18ad16fe6f373",
      "0x00000000000000000000000000000000000a408593fd266aefe53d9f106f4b66",
      "0x000000000000000000000000000000f64b6aae578a800d38e3d7ca131e4122f1",
      "0x00000000000000000000000000000000000beb2998f415c1b5ac31b79638f67f",
      "0x0000000000000000000000000000009eefeb484608dd030f17956fe8d46e1a6e",
      "0x00000000000000000000000000000000002fd6fc0e3e4e281b8460cfd014108e",
      "0x000000000000000000000000000000121df23aed1d9750ddf96a008b57e08a86",
      "0x00000000000000000000000000000000001645caeefbdc03a8fa90b07f59eaf7",
      "0x000000000000000000000000000000ba3b46d0d6135f7496534698caed750ddc",
      "0x000000000000000000000000000000000007bd3f53b227c806e59a31c6a475db",
      "0x000000000000000000000000000000f9f21a874499b5ec15c5ca6fc09025f38f",
      "0x00000000000000000000000000000000001f94fca73ebbecfb17f88f1baf73ac",
      "0x000000000000000000000000000000f015589c09cc84b00025ef9c028c7d708b",
      "0x00000000000000000000000000000000002c0c4231faea0006e497493e77c39a",
      "0x0000000000000000000000000000009b3e9403dee4049bdca4aba23d6e79da7f",
      "0x00000000000000000000000000000000001adcfc13fb44f5c9dbbbff5baefe35",
      "0x000000000000000000000000000000e16b641d4886cc5ab42f1dc707d1ecd686",
      "0x000000000000000000000000000000000008fd028a84b09c26869c185eed0bef",
      "0x0000000000000000000000000000001eee81b23a887f299049b14c11e98460d6",
      "0x00000000000000000000000000000000002a56ce41f6b0be13b9c26747621b82",
      "0x000000000000000000000000000000d5827d6338c78656c0d12ca1aea6ef2c7c",
      "0x00000000000000000000000000000000001aa98f2de3ddda547d8f6de4e725de",
      "0x00000000000000000000000000000076b7d560f82531be5eb7095e7745909b40",
      "0x00000000000000000000000000000000001c5c2ff5c32acb1c39c3adcca023a0",
      "0x0000000000000000000000000000008babcb12c5d79845a0686ca78cc2de95db",
      "0x000000000000000000000000000000000002203bccc772016c50fab3739d9260",
      "0x000000000000000000000000000000d87346165b48085b6c23aacf6f425d6054",
      "0x0000000000000000000000000000000000266218520b22c1091090a55dab05dd",
      "0x0000000000000000000000000000002e0a57f38c313a2a63fd67feccc35ece73",
      "0x000000000000000000000000000000000016bd438c544c670b8b853ae47913fc",
      "0x0000000000000000000000000000000f7ba94963bec143a0f52f572da28074bc",
      "0x0000000000000000000000000000000000190981400d3732f5370af74a117889",
      "0x000000000000000000000000000000f009248f998113a91720600261621462e8",
      "0x000000000000000000000000000000000006afadda4b159da16f5918bdb17392",
      "0x00000000000000000000000000000073a5e7a42c43f27b903d06835f5ec817b9",
      "0x0000000000000000000000000000000000097c961841173ddc02a8d07ed9ccb8",
      "0x00000000000000000000000000000045201617079c73c4c3e03532fb667555ca",
      "0x00000000000000000000000000000000000c545b0c65be5ff8315f2b3ea8885d",
      "0x0000000000000000000000000000006dbee5472d173f4952ee3cdf2931f1113a",
      "0x00000000000000000000000000000000001a11b75f9bb0e1ec84d82852e39a98",
      "0x0000000000000000000000000000006fa74a5986c42a2aec0bedf16a29697de3",
      "0x0000000000000000000000000000000000034ce8365af06b4f1ec8d7420af6c4",
      "0x000000000000000000000000000000e2c8585fde1810fbaa77bbbe2dd56d41d4",
      "0x0000000000000000000000000000000000296114e0a756b5d5cd7e46e2695e51",
      "0x000000000000000000000000000000c4fc22fafd30a41a4a26fb95d60484fbea",
      "0x000000000000000000000000000000000023d2914b6223bf5b44c6782f394a29",
      "0x00000000000000000000000000000086d3143829ea88a0d6f4b4b760e14ab029",
      "0x00000000000000000000000000000000000c2bb9b83fbabeb075a21e7eecf6d8",
      "0x000000000000000000000000000000175f07fc4313ce41e7ef4d41ae013f5e11",
      "0x00000000000000000000000000000000001c657e29b1b955b8932ec2499d75f0",
      "0x0000000000000000000000000000007f96d77047774b199ae3a2883be22056a4",
      "0x00000000000000000000000000000000000dc23823e29ef492b1f5c8dad1c858",
      "0x0000000000000000000000000000005206653c44cfe4b70f74540f0b36cbf3de",
      "0x000000000000000000000000000000000007df9f6c57efdf4f8c756716ab4971",
      "0x00000000000000000000000000000084a3a2236ae716d15b7f231c3b112c11d8",
      "0x00000000000000000000000000000000002fc195a00975bb1e104315fde74fba",
      "0x0000000000000000000000000000001fb188950a9042501dea9c5e41249f048e",
      "0x00000000000000000000000000000000000a2dcdd0ecc684d8f223108fe76f36",
      "0x0000000000000000000000000000006e0c6294c6fef9364a51663f232e87b164",
      "0x00000000000000000000000000000000001aa9cd3d3a2702773b075bc0a41ed2",
      "0x00000000000000000000000000000043e69420e32ad158ddc4f780c5ec450170",
      "0x000000000000000000000000000000000023236a0c4e5b2fa087623103946e6d",
      "0x000000000000000000000000000000a87e61ca1ef85e4334b3d3424f4fd04ce8",
      "0x00000000000000000000000000000000000c930be988435b62bb59368a3d5438",
      "0x000000000000000000000000000000ae32864153b3216c79449dbfa1ef1ebc21",
      "0x000000000000000000000000000000000025d638a3e0727f5b27c2185c591da0",
      "0x000000000000000000000000000000e36d2c23ee852a9f8c584161b263d3561e",
      "0x00000000000000000000000000000000000a14c0104de42fab8a8a2348484b40",
      "0x0000000000000000000000000000006a13811447b3bc24db7850eae7cf5452b3",
      "0x000000000000000000000000000000000002f8a055f16e97138464454e022aac"
    ],
    "hash": "0x28471e67829d2b5a816190f2c94801d2fe89d011aa96e0d9359109ff5c998433"
  },
  "aztec_version": "6.0.0-rc.3"
}
;
